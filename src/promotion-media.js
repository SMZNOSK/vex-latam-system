import { PlayerCards, MAX_CARD_BYTES } from './player-cards.js';
import { youtubeVideoId } from './promotion-domain.js';

export class PromotionMedia {
  constructor(directory, fetcher = fetch) {
    this.cards = new PlayerCards(directory, fetcher, {maxWidth:1280,maxHeight:720});
    this.fetcher = fetcher; this.cache = new Map();
  }
  async videoCover(url) {
    const id = youtubeVideoId(url);
    if (!id) return null; // No solicitar páginas ni imágenes de destinos arbitrarios.
    if (this.cache.has(id)) return this.cache.get(id);
    for (const size of ['maxresdefault','hqdefault']) {
      try {
        const response=await this.fetcher(`https://i.ytimg.com/vi/${id}/${size}.jpg`,{redirect:'error',signal:AbortSignal.timeout(5000)});
        if(!response.ok||!response.body||Number(response.headers.get('content-length')??0)>MAX_CARD_BYTES)continue;
        const reader=response.body.getReader(),parts=[];let bytes=0;
        try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_CARD_BYTES)throw Error('Imagen demasiado grande');parts.push(Buffer.from(value));}}
        finally{await reader.cancel().catch(()=>{});}
        const ref=await this.cards.import(Buffer.concat(parts));
        if(ref.width<300)continue;
        const cover={ref,data:await this.cards.dataURI(ref)};
        this.cache.set(id,cover);if(this.cache.size>32)this.cache.delete(this.cache.keys().next().value);
        return cover;
      }catch{/* Permitir una portada adjunta o el diseño sin carátula. */}
    }
    return null;
  }
}
