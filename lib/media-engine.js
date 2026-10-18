/**
 * Media objects — timeline-linked video/audio inside slide coordinate system.
 */

const { normalizeTrigger } = require('./timeline-scheduler');

function inferMediaTrigger(slideXml, objectId, mediaNode) {
  if (/<p:timing[\s>]/.test(slideXml)) {
    const re = new RegExp(
      `<p:video|<p:audio|<p:media[\\s\\S]*?spid="${objectId}"[\\s\\S]*?<p:stCondLst>[\\s\\S]*?evt="onClick"`,
      'i'
    );
    if (re.test(slideXml)) return { type: 'onClick', object: String(objectId) };
  }
  if (mediaNode?.autoplay) return { type: 'automatic', object: null };
  return { type: 'onClick', object: String(objectId) };
}

function normalizeMediaObject(media, slideXml) {
  const trigger = inferMediaTrigger(slideXml, media.objectId, media);
  return {
    id: String(media.objectId),
    type: media.type,
    src: media.src,
    poster: media.poster || null,
    xPct: media.leftPct,
    yPct: media.topPct,
    widthPct: media.widthPct,
    heightPct: media.heightPct,
    autoplay: !!media.autoplay,
    loop: !!media.loop,
    muted: !!media.muted,
    volume: media.volume ?? 0.8,
    startOnClick: media.startOnClick !== false && !media.autoplay,
    timelineLinked: !!media.timelineLinked,
    trigger: {
      type: trigger.type === 'onClick' ? 'onClick' : trigger.type,
      object: trigger.object,
    },
    ooxml: {
      objectId: media.objectId,
      autoplay: !!media.autoplay,
      muted: !!media.muted,
    },
  };
}

function normalizeSlideMedia(slide) {
  const xml = slide._slideXml || '';
  return (slide.media || [])
    .filter((m) => m.src && (m.type === 'video' || m.type === 'audio'))
    .map((m) => normalizeMediaObject(m, xml));
}

module.exports = {
  normalizeMediaObject,
  normalizeSlideMedia,
  inferMediaTrigger,
};
