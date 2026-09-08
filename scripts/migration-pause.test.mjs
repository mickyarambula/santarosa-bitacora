import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrationPauseResponse} from './migration-pause.mjs';

test('source pause rejects existing tabs, server functions and new registrations', async () => {
  for (const path of ['/', '/_serverFn/example', '/api/auth/sign-up/email', '/api/auth/callback/google']) {
    for (const method of ['GET','POST','PUT','DELETE']) {
      const response = migrationPauseResponse('paused', method, path);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  assert.equal(migrationPauseResponse('paused','POST','/api/migration-backup'),null);
  assert.equal(migrationPauseResponse('paused','GET','/api/migration-backup').status,503);
  assert.equal(migrationPauseResponse(undefined,'POST','/'),null);
});
test('moved source redirects navigation but never replays a mutation', async () => {
  const response = migrationPauseResponse('moved','GET','/productores');
  assert.equal(response.status,200);
  assert.match(await response.text(), /window.location.replace\("https:\/\/santarosa-bitacora.vercel.app\/productores"\)/);
  assert.equal(await migrationPauseResponse('moved','HEAD','/productores').text(),'');
  const unsafe = await migrationPauseResponse('moved','GET','/</script><script>alert(1)</script>').text();
  assert.ok(!unsafe.includes('</script><script>alert(1)'));
  assert.equal(migrationPauseResponse('moved','POST','/_serverFn/example').status,409);
});
