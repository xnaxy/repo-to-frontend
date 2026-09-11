/** Pure construction geometry, not reference extraction or browser evidence.
 * All coordinates use one explicitly chosen SVG user space. No auto layout,
 * simplification, interpolation across gaps, formatting, or acceptance scores.
 */
const finite = value => typeof value === 'number' && Number.isFinite(value);
const dense = values => Array.isArray(values) && Array.from({length:values.length},(_,i)=>Object.hasOwn(values,i)).every(Boolean);
const vector = (value, size) => dense(value) && value.length === size && value.every(finite);
const idValid = value => typeof value === 'string' && value.trim().length > 0;
function requireValid(condition, message) { if (!condition) throw new Error(message); }
function rectangle(box) { return vector(box,4) && box[2]>0 && box[3]>0; }
function uniqueById(items, label) {
  requireValid(dense(items), `${label} must be a dense array`);
  const map = new Map();
  for (const item of items) {
    requireValid(item && idValid(item.id) && !map.has(item.id), `${label}: missing or duplicate id`);
    map.set(item.id,item);
  }
  return map;
}
function portPoint(box, port) {
  requireValid(vector(port,2) && port.every(v=>v>=0 && v<=1)
    && port.some(v=>v===0 || v===1), 'Port must lie on the node bounding rectangle');
  const point = [box[0]+port[0]*box[2],box[1]+port[1]*box[3]];
  requireValid(point.every(finite),'Port coordinate overflow');
  return point;
}
const pathFor = points => points.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ');

/** Each semantic edge remains separate, even when portions overlap visually.
 * via is the measured bend list; callers must not assume this routes obstacles.
 */
export function buildRelations(nodes, edges) {
  const byId = uniqueById(nodes,'nodes');
  uniqueById(edges,'edges');
  for (const node of nodes) requireValid(rectangle(node.bbox),`Invalid node rectangle: ${node.id}`);
  return edges.map(edge=>{
    requireValid(byId.has(edge.from) && byId.has(edge.to),`Unresolved endpoint: ${edge.id}`);
    requireValid(['directed','reverse','bidirectional','undirected'].includes(edge.direction),`Unknown direction: ${edge.id}`);
    requireValid(['orthogonal','polyline'].includes(edge.routing),`Unknown routing: ${edge.id}`);
    requireValid(dense(edge.via) && edge.via.every(p=>vector(p,2)),`Invalid bends: ${edge.id}`);
    const start=portPoint(byId.get(edge.from).bbox,edge.fromPort);
    const end=portPoint(byId.get(edge.to).bbox,edge.toPort);
    const points=[start,...edge.via.map(p=>[...p]),end];
    for(let i=1;i<points.length;i++) {
      const [a,b]=[points[i-1],points[i]];
      requireValid(a[0]!==b[0] || a[1]!==b[1],`Zero-length segment: ${edge.id}`);
      if(edge.routing==='orthogonal') requireValid(a[0]===b[0] || a[1]===b[1],`Diagonal segment in orthogonal route: ${edge.id}`);
    }
    return {id:edge.id,from:edge.from,to:edge.to,direction:edge.direction,
      anchors:[start,end],points,path:pathFor(points),
      arrowStart:['reverse','bidirectional'].includes(edge.direction),
      arrowEnd:['directed','bidirectional'].includes(edge.direction)};
  });
}

/** A categorical x axis and linear y axis; one observation per category.
 * yDomain lists bottom then top values (descending permitted if deliberate).
 * Missing observations are explicit nulls; caller supplies the whole domain.
 * Unlabelled reference values are unknown, not inferred business facts.
 */
export function projectSeries(config, observations) {
  requireValid(config && rectangle(config.plot),'Invalid plot rectangle');
  const {plot,xDomain,yDomain}=config;
  requireValid(dense(xDomain) && xDomain.length>0 && xDomain.every(idValid)
    && new Set(xDomain).size===xDomain.length,'Invalid or duplicate category domain');
  requireValid(vector(yDomain,2) && yDomain[0]!==yDomain[1]
    && finite(yDomain[1]-yDomain[0]),'Invalid linear y domain');
  uniqueById(observations,'observations');
  requireValid(observations.length===xDomain.length,'Supply every category, using null for missing observations');
  const byX=new Map();
  for(const observation of observations) {
    requireValid(xDomain.includes(observation.x) && !byX.has(observation.x),'Unknown or duplicate observation category');
    requireValid(observation.value===null || finite(observation.value),'Observation must be a finite number or explicit null');
    if(observation.value!==null) requireValid(observation.value>=Math.min(...yDomain)
      && observation.value<=Math.max(...yDomain),'Observation outside frozen y domain; do not clamp');
    byX.set(observation.x,observation);
  }
  const y=value=>plot[1]+plot[3]*(1-(value-yDomain[0])/(yDomain[1]-yDomain[0]));
  const marks=[],segments=[],missing=[];
  let segment=[];
  const finish=()=>{if(segment.length){segments.push({ids:segment.map(m=>m.id),path:pathFor(segment.map(m=>m.position))});segment=[];}};
  xDomain.forEach((category,index)=>{
    const observation=byX.get(category);
    if(observation.value===null){missing.push(observation.id);finish();return;}
    const position=[plot[0]+plot[2]*(xDomain.length===1?.5:index/(xDomain.length-1)),y(observation.value)];
    requireValid(position.every(finite),'Projected coordinate overflow');
    const mark={id:observation.id,x:category,value:observation.value,position};
    marks.push(mark);segment.push(mark);
  });
  finish();
  const zeroY=Math.min(...yDomain)<=0 && Math.max(...yDomain)>=0 ? y(0) : null;
  return {marks,segments,missing,zeroY};
}
