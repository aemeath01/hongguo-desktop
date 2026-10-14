import {createHash,createPublicKey,verify} from 'node:crypto';
export function verifyTauriSignature(data,signature,pubkey){
 const publicLines=Buffer.from(pubkey.trim(),'base64').toString('utf8').trim().split(/\r?\n/);
 const signedLines=Buffer.from(signature.trim(),'base64').toString('utf8').trim().split(/\r?\n/);
 const pub=Buffer.from(publicLines[1]||'','base64'),sig=Buffer.from(signedLines[1]||'','base64');
 if(pub.length!==42||sig.length!==74||!pub.subarray(2,10).equals(sig.subarray(2,10)))return false;
 if(sig.subarray(0,2).toString()!=='ED')return false;
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),pub.subarray(10)]),format:'der',type:'spki'});
 const digest=createHash('blake2b512').update(data).digest();
 if(!verify(null,digest,key,sig.subarray(10)))return false;
 const comment=signedLines[2]?.replace(/^trusted comment: /,'');
 return typeof comment==='string'&&verify(null,Buffer.concat([sig.subarray(10),Buffer.from(comment)]),key,Buffer.from(signedLines[3]||'','base64'));
}
