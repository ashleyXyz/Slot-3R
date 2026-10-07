// Match the thumbnail projection, letterboxing its framing to the live viewport.
export function applyThumbnailFraming(camera, view, width, height) {
  camera.clearViewOffset();
  camera.aspect=width/height;
  camera.zoom=1;
  if(view){
    const fit=Math.min(width/view.width,height/view.height);
    camera.fov=view.fov;
    camera.zoom=view.zoom*fit*view.height/height;
    camera.setViewOffset(width,height,
      view.offset[0]*view.zoom*fit,view.offset[1]*view.zoom*fit,width,height);
  }
  camera.updateProjectionMatrix();
}
