import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {verifyTauriSignature} from '../scripts/update-signature.mjs';
function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const raw=publicKey.export({type:'spki',format:'der'}).subarray(-32),id=Buffer.from('01234567');
 const data=Buffer.from('test installer bytes, no real program');
 const sig=sign(null,createHash('blake2b512').update(data).digest(),privateKey),comment='timestamp:123';
 const global=sign(null,Buffer.concat([sig,Buffer.from(comment)]),privateKey);
 const pubkey=Buffer.from('untrusted comment: test\n'+Buffer.concat([Buffer.from('Ed'),id,raw]).toString('base64')).toString('base64');
 const signature=Buffer.from('untrusted comment: test\n'+Buffer.concat([Buffer.from('ED'),id,sig]).toString('base64')+'\ntrusted comment: '+comment+'\n'+global.toString('base64')).toString('base64');
 return {data,pubkey,signature};
}
test('update signature accepts signed bytes and rejects modified package or another release key',()=>{
 const a=fixture();assert.equal(verifyTauriSignature(a.data,a.signature,a.pubkey),true);
 const changed=Buffer.from(a.data);changed[0]^=1;
 assert.equal(verifyTauriSignature(changed,a.signature,a.pubkey),false);
 assert.equal(verifyTauriSignature(a.data,a.signature,fixture().pubkey),false);
});
test('update signature rejects modified trusted comment and malformed signature',()=>{
 const a=fixture(),changed=Buffer.from(Buffer.from(a.signature,'base64').toString().replace('timestamp:123','timestamp:456')).toString('base64');
 assert.equal(verifyTauriSignature(a.data,changed,a.pubkey),false);
 assert.equal(verifyTauriSignature(a.data,'invalid',a.pubkey),false);
});
