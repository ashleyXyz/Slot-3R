// Observation timestamps preserve the source sequence's actual timing.
export function replayState(frames, totalPoints, time, ended=false, showFull=false){
  let index;
  if(ended) index=frames.length-1;
  else{
    let lo=0,hi=frames.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(frames[mid].time<=time)lo=mid+1;else hi=mid;}
    index=lo-1;
  }
  return {index,pointCount:showFull||ended?totalPoints:(frames[index]?.end||0),
          complete:index===frames.length-1};
}
