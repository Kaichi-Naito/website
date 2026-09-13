import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDepth} from './projection.mjs';
test('perspective keeps spawn and judgment fixed, with increasing approach speed',()=>{
  assert.equal(projectDepth(0),0);assert.equal(projectDepth(1),1);
  let previous=-1,previousStep=0;
  for(let i=0;i<=10;i++){
    const next=projectDepth(i/10);assert(next>previous);
    if(i>0){const step=next-previous;assert(step>previousStep);previousStep=step;}
    previous=next;
  }
  assert(projectDepth(.5)<.5);assert(Number.isFinite(projectDepth(1.2)));
});
