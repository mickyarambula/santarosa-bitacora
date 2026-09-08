// Audit only: executes actual CRM handlers against a disposable in-memory PGLite.
// No DATABASE_URL, network calls, production data, HTTP sessions, or app edits.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const realRequire = createRequire(path.join(root, "package.json"));
const ts = realRequire("typescript");
const { PGlite } = realRequire("@electric-sql/pglite");
module.exports = async function makeHarness() {
  const db = new PGlite();
  let actor = "manager";
  const sql = async (strings, ...values) => {
    let query = strings[0];
    for (let i = 0; i < values.length; i++) query += `$${i + 1}${strings[i + 1]}`;
    return (await db.query(query, values)).rows;
  };
  sql.query = async (q, p = []) => (await db.query(q, p)).rows;
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const m = { exports: {} };
    cache.set(file, m);
    const req = (id) => {
      if (id === "@tanstack/react-start")
        return {
          createServerFn: () => ({
            validate: (d) => d,
            middleware() {
              return this;
            },
            validator(fn) {
              this.validate = fn;
              return this;
            },
            handler(fn) {
              const validate = this.validate;
              return (args) => fn({ ...args, data: validate(args.data) });
            },
          }),
        };
      if (id === "@/lib/auth/middleware") return { authMiddleware: {} };
      if (id === "@/lib/db") return { getSql: async () => sql };
      if (id === "@/lib/auth/verify.server")
        return { getSessionUser: async () => ({ id: actor, email: `${actor}@audit.invalid` }) };
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/")
          ? path.join(root, "src", id.slice(2))
          : path.resolve(path.dirname(file), id);
        const target = [base, base + ".ts", base + ".js"].find(
          (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
        );
        if (!target) throw Error("Missing audit dependency " + id);
        return load(target);
      }
      return realRequire(id);
    };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(
      req,
      m,
      m.exports,
    );
    return m.exports;
  }

  await db.waitReady;
  for (const file of fs
    .readdirSync(path.join(root, "migrations"))
    .filter((x) => /^\d+.*\.sql$/.test(x))
    .sort())
    await db.exec(fs.readFileSync(path.join(root, "migrations", file), "utf8"));
  let injectedFailure = "";
  sql.transaction = (work) =>
    db.transaction(async (client) => {
      const query = async (text, params) => {
        if (injectedFailure && text.includes(injectedFailure))
          throw Error("INJECTED_WRITE_FAILURE");
        return (await client.query(text, params)).rows;
      };
      const tx = async (strings, ...values) => {
        let q = strings[0];
        for (let i = 0; i < values.length; i++) q += `$${i + 1}${strings[i + 1]}`;
        return query(q, values);
      };
      tx.query = query;
      tx.transaction = (fn) => fn(tx);
      return work(tx);
    });
  const crm = load(path.join(root, "src/lib/crm.ts"));
  return {
    db,
    sql,
    load,
    failOn(text) {
      injectedFailure = text;
    },
    async reset() {
      injectedFailure = "";
      await db.exec(
        "truncate producers cascade; truncate producer_groups, profiles, revoked_users, announcements, crm_audit;",
      );
      await db.query(
        "insert into profiles(user_id,display_name,role,status) values ('manager','Gerencia prueba','gerente','activo'),('agent_a','Agente A','comisionista','activo'),('agent_b','Agente B','comisionista','activo')",
      );
    },
    async call(name, user, data = {}) {
      actor = user;
      return crm[name]({ context: { userId: user }, data });
    },
  };
};
