import test from 'node:test';
import assert from 'node:assert/strict';
import {readSettings,tapLevel,approachSeconds} from './settings.mjs';
test('new defaults center speed on old 8 and set tap 70% to old maximum times 1.5',()=>{
  assert.equal(readSettings().speed,(2+14)/2);
  assert.equal(readSettings().tapVolume,70);
  assert.equal(tapLevel(70),.6);
  assert(Math.abs(approachSeconds(8)-(3.8-8*.32))<1e-12);
  assert(approachSeconds(2)>approachSeconds(8));
  assert(approachSeconds(8)>approachSeconds(14));
  assert(approachSeconds(14)>0);
});
