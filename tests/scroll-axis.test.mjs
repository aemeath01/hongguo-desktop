import test from 'node:test';
import assert from 'node:assert/strict';
import {createWheelIntent,dragAxis,installAxisScroll} from '../src/scroll-axis.js';
test('one wheel gesture retains its axis and rail through a diagonal momentum tail',()=>{
 const intent=createWheelIntent(),rail={};
 assert.deepEqual(intent(30,5,0,rail),{axis:'x',target:rail});
 assert.deepEqual(intent(2,20,80,{}),{axis:'x',target:rail});
 assert.deepEqual(intent(-15,2,140,null),{axis:'x',target:rail});
 assert.equal(intent(2,30,400,null).axis,'y');
 assert.equal(intent(30,1,450,rail).axis,'y');
});
test('drag intent waits for movement and distinguishes vertical from horizontal',()=>{
 assert.equal(dragAxis(3,5),null);assert.equal(dragAxis(7,14),'y');assert.equal(dragAxis(-20,9),'x');
});
function page(mode){
 class Element extends EventTarget {}
 const root=new Element(),rail=new Element();rail.isConnected=true;rail.scrollLeft=0;rail.closest=()=>rail;
 const doc=new EventTarget();doc.scrollingElement={scrollTop:80};doc.body={};
 doc.defaultView={Element,Event,innerHeight:800,getComputedStyle:()=>({overflowY:'visible'})};
 root.ownerDocument=doc;rail.parentElement=doc.body;
 const remove=installAxisScroll(root,mode);
 function wheel(x,y,time,options={}){const e=new Event('wheel',{cancelable:true});Object.defineProperties(e,Object.fromEntries(Object.entries({target:rail,deltaX:x,deltaY:y,timeStamp:time,deltaMode:0,...options}).map(([key,value])=>[key,{value}])));root.dispatchEvent(e);return e;}
 return {root,rail,doc,wheel,remove};
}
test('horizontal gestures never scroll the page, vertical gestures never scroll the rail',()=>{
 const p=page('rails');p.wheel(50,9,0);p.wheel(3,30,80);assert.equal(p.doc.scrollingElement.scrollTop,80);assert.equal(p.rail.scrollLeft,53);
 p.wheel(9,50,400);p.wheel(30,3,460);assert.equal(p.doc.scrollingElement.scrollTop,133);assert.equal(p.rail.scrollLeft,53);
 p.remove();assert.equal(p.wheel(50,0,800).defaultPrevented,false);
});
test('settings discard horizontal wheel and retain vertical scrolling and pinch zoom',()=>{
 const p=page('vertical');p.wheel(50,0,0);p.wheel(20,40,70);assert.equal(p.rail.scrollLeft,0);assert.equal(p.doc.scrollingElement.scrollTop,120);
 assert.equal(p.wheel(10,30,100,{ctrlKey:true}).defaultPrevented,false);assert.equal(p.doc.scrollingElement.scrollTop,120);
});
test('shift wheel and line delta units are handled as horizontal input',()=>{
 const p=page('rails');p.wheel(0,3,0,{shiftKey:true,deltaMode:1});assert.equal(p.rail.scrollLeft,48);assert.equal(p.doc.scrollingElement.scrollTop,80);
});
