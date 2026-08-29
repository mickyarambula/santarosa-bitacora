import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { duplicateMessage, findDuplicateProducer, groupDuplicates, groupReason, nameKey, phoneKey, pickWinner } from "./producer-match.ts";

describe("producer match", () => {
  it("treats accents and extra spaces as the same name", () => {
    assert.equal(nameKey("  José  Pérez "), "jose perez");
    assert.equal(nameKey("JOSE PEREZ"), "jose perez");
  });

  it("uses the last 10 digits of a phone", () => {
    assert.equal(phoneKey("687 123 4567"), "6871234567");
    assert.equal(phoneKey("+52 6871234567"), "6871234567");
    assert.equal(phoneKey("123"), "");
  });

  it("blocks the same producer for the same comisionista", () => {
    const hit = findDuplicateProducer(
      [
        {
          id: "1",
          name: "José Pérez",
          ownerUserId: "jorge",
          comisionistaName: "Jorge",
          zone: "Guasave",
          phone: "6871111111",
        },
      ],
      {
        name: "Jose Perez",
        ownerUserId: "jorge",
        comisionistaName: "Jorge",
        zone: "Ahome",
        phone: "",
      },
    );
    assert.equal(hit?.via, "nombre");
    assert.match(duplicateMessage(hit!, "Jorge"), /ya lo capturaste/i);
  });

  it("blocks the same phone even with another name", () => {
    const hit = findDuplicateProducer(
      [
        {
          id: "1",
          name: "Agrícola El Roble",
          ownerUserId: "luis",
          comisionistaName: "Luis Cota",
          zone: "Guasave",
          phone: "6871234567",
        },
      ],
      {
        name: "El Roble SPR",
        ownerUserId: "jorge",
        comisionistaName: "Jorge",
        zone: "Ahome",
        phone: "687 123 4567",
      },
    );
    assert.equal(hit?.via, "telefono");
    assert.match(duplicateMessage(hit!, "Jorge"), /grupo/i);
  });

  it("allows the same WhatsApp when they go in a group", () => {
    const hit = findDuplicateProducer(
      [
        {
          id: "1",
          name: "Don Chema",
          ownerUserId: "jorge",
          comisionistaName: "Jorge",
          zone: "Guasave",
          phone: "6871234567",
          groupId: "g1",
        },
      ],
      {
        name: "María Ramírez",
        ownerUserId: "jorge",
        comisionistaName: "Jorge",
        zone: "Guasave",
        phone: "6871234567",
        groupId: "g1",
      },
    );
    assert.equal(hit, null);
  });

  it("blocks the same producer even if another comisionista captures it", () => {
    const hit = findDuplicateProducer(
      [
        {
          id: "1",
          name: "Juan Perez",
          ownerUserId: "luis",
          comisionistaName: "Luis Cota",
          zone: "Guasave",
          phone: null,
        },
      ],
      {
        name: "Juan Perez",
        ownerUserId: "jorge",
        comisionistaName: "Jorge",
        zone: "Ahome",
        phone: "",
      },
    );
    assert.equal(hit?.agent, "Luis Cota");
    assert.match(duplicateMessage(hit!, "Jorge"), /lo lleva Luis Cota/i);
  });

  it("batches duplicates by name, not by shared family phone", () => {
    const groups = groupDuplicates([
      { id: "1", name: "José Pérez", ownerUserId: "jorge", comisionistaName: "Jorge", zone: "Guasave", phone: "6871111111" },
      { id: "2", name: "Jose Perez", ownerUserId: "jorge", comisionistaName: "Jorge", zone: "Guasave", phone: null },
      { id: "3", name: "Agrícola Sol", ownerUserId: "luis", comisionistaName: "Luis", zone: "Ahome", phone: "6879990000" },
      { id: "4", name: "María Sol", ownerUserId: "ana", comisionistaName: "Ana", zone: "Ahome", phone: "6879990000" },
      { id: "5", name: "Don Ramón", ownerUserId: "luis", comisionistaName: "Luis", zone: "Guasave", phone: null },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.length, 2);
    assert.equal(groupReason(groups[0]!), "nombre");
  });

  it("keeps the fuller ficha when cleaning a batch", () => {
    const keep = pickWinner([
      {
        id: "thin",
        name: "José Pérez",
        ownerUserId: "jorge",
        comisionistaName: "Jorge",
        zone: "Guasave",
        phone: null,
        hectares: 0,
        stage: "prospecto",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "full",
        name: "Jose Perez",
        ownerUserId: "luis",
        comisionistaName: "Luis",
        zone: "Guasave",
        phone: "6871111111",
        hectares: 80,
        stage: "papeleria",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ]);
    assert.equal(keep.id, "full");
  });
});