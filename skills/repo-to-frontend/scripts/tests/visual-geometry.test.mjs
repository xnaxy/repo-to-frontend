import { existsSync } from 'node:fs';

const source = new URL('../visual-geometry.mjs', import.meta.url);
const load = async () => {
  expect(existsSync(source), 'A reusable construction helper is required').toBe(true);
  return import(source.href);
};
const nodes = [
  { id: 'input', bbox: [10, 20, 100, 40] },
  { id: 'operator', bbox: [150, 30, 20, 20] },
  { id: 'output', bbox: [210, 80, 80, 60] },
];
const edge = { id:'input-op', from:'input', to:'operator', fromPort:[1,.5], toPort:[0,.5], via:[], routing:'orthogonal', direction:'directed' };
const chart = { plot:[40,20,300,100], xDomain:['A','B','C','D'], yDomain:[-10,10] };

test('builds one path for every declared semantic edge with explicit arrow ends', async () => {
  const {buildRelations} = await load();
  const edges = buildRelations(nodes, [edge, {id:'op-out',from:'operator',to:'output',fromPort:[.5,1],toPort:[0,.5],via:[[160,110]],routing:'orthogonal',direction:'undirected'}]);
  expect(edges.map(x=>x.id)).toEqual(['input-op','op-out']);
  expect(edges[0]).toMatchObject({path:'M 110 40 L 150 40',anchors:[[110,40],[150,40]],arrowStart:false,arrowEnd:true});
  expect(edges[1]).toMatchObject({path:'M 160 50 L 160 110 L 210 110',arrowEnd:false});
});
test.each([['directed',false,true],['reverse',true,false],['bidirectional',true,true],['undirected',false,false]])('preserves %s arrows without reversing node meaning',async(direction,start,end)=>{
  const {buildRelations}=await load();
  expect(buildRelations(nodes,[{...edge,direction}])[0]).toMatchObject({from:'input',to:'operator',arrowStart:start,arrowEnd:end});
});
test('repositions attached endpoints when their measured node moves',async()=>{
  const {buildRelations}=await load();
  const moved=structuredClone(nodes);moved[0].bbox[0]=20;
  expect(buildRelations(moved,[edge])[0].anchors[0]).toEqual([120,40]);
  expect(nodes[0].bbox[0]).toBe(10);
});
test.each([
 ['missing node',{...edge,to:'absent'}],
 ['invalid port',{...edge,fromPort:[2,.5]}],
 ['interior port',{...edge,fromPort:[.5,.5]}],
 ['invented direction',{...edge,direction:'auto'}],
 ['diagonal orthogonal route',{...edge,toPort:[0,0]}],
 ['nonfinite turn',{...edge,via:[[Infinity,40]]}],
])('rejects %s rather than silently dropping or rerouting it',async(_label,input)=>{
 const {buildRelations}=await load();expect(()=>buildRelations(nodes,[input])).toThrow();
});
test('rejects duplicate edges and duplicate node identity',async()=>{
 const {buildRelations}=await load();expect(()=>buildRelations(nodes,[edge,edge])).toThrow();expect(()=>buildRelations([...nodes,nodes[0]],[edge])).toThrow();
});
test('does not fabricate bends for a known diagonal straight edge',async()=>{
 const {buildRelations}=await load();expect(buildRelations(nodes,[{...edge,toPort:[0,0],routing:'polyline'}])[0].path).toBe('M 110 40 L 150 30');
});
test('keeps negative, zero, missing and positive marks distinct; null splits the line',async()=>{
 const {projectSeries}=await load();
 const result=projectSeries(chart,[{id:'a',x:'A',value:-10},{id:'b',x:'B',value:0},{id:'c',x:'C',value:null},{id:'d',x:'D',value:10}]);
 expect(result.marks.map(p=>[p.id,p.position])).toEqual([['a',[40,120]],['b',[140,70]],['d',[340,20]]]);
 expect(result.segments.map(s=>s.ids)).toEqual([['a','b'],['d']]);
 expect(result.missing).toEqual(['c']);expect(result.zeroY).toBe(70);
});
test('category position respects the full domain and never compacts omitted periods',async()=>{
 const {projectSeries}=await load();
 expect(()=>projectSeries(chart,[{id:'a',x:'A',value:1},{id:'d',x:'D',value:2}])).toThrow();
});
test.each([
 ['first missing',[null,0,5,10],[['b','c','d']],['a']],
 ['middle missing',[-10,null,5,10],[['a'],['c','d']],['b']],
 ['last missing',[-10,0,5,null],[['a','b','c']],['d']],
 ['all missing',[null,null,null,null],[],['a','b','c','d']],
 ['isolated interior point',[null,0,null,null],[['b']],['a','c','d']],
])('preserves final segment boundaries with %s',async(_label,values,expectedSegments,expectedMissing)=>{
 const {projectSeries}=await load();
 const result=projectSeries(chart,values.map((value,i)=>({id:'abcd'[i],x:chart.xDomain[i],value})));
 expect(result.segments.map(s=>s.ids)).toEqual(expectedSegments);
 expect(result.missing).toEqual(expectedMissing);
 expect(result.marks.map(m=>m.id)).toEqual(expectedSegments.flat());
 for(const segment of result.segments){
  expect(segment.path.startsWith('M ')).toBe(true);
  expect((segment.path.match(/\bM\b/g)||[]).length).toBe(1);
  expect((segment.path.match(/\bL\b/g)||[]).length).toBe(segment.ids.length-1);
 }
});
test('supports deliberately descending y scale and single category without inventing zero',async()=>{
 const {projectSeries}=await load();
 const result=projectSeries({plot:[10,20,80,100],xDomain:['Q'],yDomain:[20,10]},[{id:'q',x:'Q',value:15}]);
 expect(result.marks[0].position).toEqual([50,70]);expect(result.zeroY).toBeNull();
});
test.each([
 ['same endpoints',{...chart,yDomain:[1,1]}],['zero plot',{...chart,plot:[0,0,0,100]}],['duplicate category',{...chart,xDomain:['A','A']}],
])('rejects %s chart geometry',async(_name,input)=>{
 const {projectSeries}=await load();expect(()=>projectSeries(input,[])).toThrow();
});
test('refuses string, nonfinite, duplicate and out of domain data without clamping',async()=>{
 const {projectSeries}=await load();
 for(const value of ['0',NaN,Infinity,11,undefined])expect(()=>projectSeries({...chart,xDomain:['A']},[{id:'a',x:'A',value}])).toThrow();
 expect(()=>projectSeries({...chart,xDomain:['A','B']},[{id:'a',x:'A',value:0},{id:'a',x:'B',value:0}])).toThrow();
});
