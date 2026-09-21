import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_URL, ResultShare, resultSnapshot, shareText, xIntent} from './result-share.mjs';

const chart = {title: '曲 &「光」 #1 🎸', artist: 'PHALUX / A+B', difficulty: 'NORMAL'};
const score = {score: 987654, rank: 'S', accuracy: 98.34, maxCombo: 123, emptyPresses: 1, counts: {PERFECT: 120, GREAT: 3, GOOD: 0, MISS: 1}};
test('X draft preserves Japanese, symbols, song, artist, score, hashtag and canonical link', () => {
  const result = resultSnapshot(chart, score);
  const intent = new URL(xIntent(result));
  assert.equal(intent.origin + intent.pathname, 'https://x.com/intent/tweet');
  assert.equal(intent.searchParams.get('text'), shareText(result));
  for (const value of [chart.title, chart.artist, '987,654点', '#T4P', APP_URL]) assert.ok(shareText(result).includes(value));
  assert.equal([...intent.searchParams].length, 1);
});
test('completed result survives chart changes and score resets', () => {
  const song = {...chart}, run = {...score, counts: {...score.counts}};
  const result = resultSnapshot(song, run);
  song.title = 'Next'; run.score = 0; run.counts.PERFECT = 0;
  assert.equal(result.title, chart.title); assert.equal(result.score, score.score);
  assert.equal(result.counts.PERFECT, 120);
  assert.ok(Object.isFrozen(result.counts));
});
test('zero score remains shareable', () => {
  assert.match(shareText(resultSnapshot(chart, {...score, score: 0})), /0点/);
});

// A small DOM fixture exercises asynchronous lifecycle without a browser dependency.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.hidden = false; this.textContent = ''; this.events = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, handler) { this.events[name] = handler; }
}
function fixture() {
  const root = new Element('section');
  const controller = Object.create(ResultShare.prototype);
  controller.root = root; controller.version = 0;
  return {root, controller};
}
globalThis.document = {createElement: tag => new Element(tag)};
const settle = () => new Promise(resolve => setImmediate(resolve));
test('leaving results discards a PNG that finishes preparing later', async () => {
  const {root, controller} = fixture(); let ready;
  controller.prepare = () => new Promise(resolve => { ready = resolve; });
  controller.show(chart, score); controller.clear();
  ready(new Blob(['png'], {type:'image/png'})); await settle();
  assert.equal(root.hidden, true); assert.equal(root.children.length, 0); assert.equal(controller.imageURL, null);
});
test('image preparation failure keeps the X draft accessible', async () => {
  const {root, controller} = fixture(); controller.prepare = async () => { throw Error('canvas'); };
  controller.show(chart, score); await settle();
  assert.equal(root.children[0].children[0].href, xIntent(resultSnapshot(chart, score)));
  assert.match(root.children[1].textContent, /画像を作れません/);
});
test('a new result replaces the old draft and invalidates pending image work', async () => {
  const {root, controller} = fixture(); const resolvers = [];
  controller.prepare = () => new Promise(resolve => resolvers.push(resolve));
  controller.show(chart, score); controller.show({...chart, title:'Next song'}, {...score, score:0});
  resolvers[0](new Blob(['old'], {type:'image/png'})); await settle();
  assert.match(new URL(root.children[0].children[0].href).searchParams.get('text'), /Next song/);
  assert.equal(root.children.length, 2); assert.equal(controller.imageURL, null);
  controller.clear(); resolvers[1](new Blob(['new'])); await settle();
});
