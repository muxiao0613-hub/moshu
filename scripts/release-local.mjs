import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

if(process.platform!=='darwin'){
  throw new Error('Local ad-hoc DMG packaging requires macOS. Use the Windows build workflow separately.');
}
// Seal the whole bundle for local installation. No Developer ID or notarization is implied.
const config={bundle:{macOS:{signingIdentity:'-'}}};
const child=spawn(process.execPath,[resolve('scripts/tauri.mjs'),'build','--bundles','app,dmg','--config',JSON.stringify(config)],{stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
