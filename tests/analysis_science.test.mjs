import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const leaves=node=>node.children.length?node.children.flatMap(leaves):[node];
const walkTree=node=>[node,...node.children.flatMap(walkTree)];
globalThis.A2CA={
  leaves,
  walkTree,
  matchTreeName(name,treeNames){return treeNames.includes(name)?name:null;}
};
vm.runInThisContext(fs.readFileSync(new URL('../resources/a2ca-analysis-science.js',import.meta.url),'utf8'),{filename:'a2ca-analysis-science.js'});

const S=globalThis.A2CA.AnalysisScience;
assert.equal(S.blosumScore('A','A'),4);
assert.equal(S.blosumScore('W','W'),11);
assert.ok(Math.abs(S.pearson([1,2,3],[2,4,6])-1)<1e-12);
assert.ok(Math.abs(S.spearman([1,2,3],[9,5,1])+1)<1e-12);

const frequencies=S.pairFrequency([
  {name:'A',aaA:'A',aaB:'V'},
  {name:'B',aaA:'A',aaB:'V'},
  {name:'C',aaA:'V',aaB:'A'}
]);
assert.equal(frequencies.total,3);
assert.equal(frequencies.counts.get('A|V'),2);

const tree={name:'',length:0,children:[
  {name:'A',length:0.1,children:[]},
  {name:'B',length:0.2,children:[]},
  {name:'C',length:0.3,children:[]}
]};
const alignment={A:'AA',B:'AV',C:'VV'};
const metrics=S.buildTreeMetrics(tree,alignment);
assert.ok(Math.abs(metrics.distance('A','B')-0.3)<1e-12);
const meanWeight=Object.values(metrics.weights).reduce((a,b)=>a+b,0)/3;
assert.ok(Math.abs(meanWeight-1)<1e-12);

const states=S.fitchStatesForPosition(tree,alignment,'A',1);
assert.equal(states.get(tree.children[0]),'A');
assert.equal(states.get(tree.children[2]),'V');
assert.equal(states.get(tree),'A');

console.log('A2CA analysis-science unit tests passed.');
