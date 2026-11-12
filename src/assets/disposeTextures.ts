import type {Texture} from 'three';
/** Only a complete asset owner calls this, after every borrowing instance has been released. */
export function disposeOwnedTextures(textures:Iterable<Texture>):void {
  const images=new Set<{close():void}>();
  for(const texture of new Set(textures)){
    texture.dispose();
    const data:unknown=texture.source.data;
    for(const image of Array.isArray(data)?data:[data]){
      if(image&&typeof (image as {close?:unknown}).close==='function')images.add(image as {close():void});
    }
  }
  // ImageBitmap CPU backing stores are not released by Texture.dispose(). glTF maps
  // can share a bitmap, so close only once after all of this owner's textures are gone.
  for(const image of images)image.close();
}
