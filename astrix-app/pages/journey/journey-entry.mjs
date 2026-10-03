import {startPage} from '../../shared/local-preview.mjs';
// Never import the live modules in preview: auth has import-time side effects.
await startPage({
  preview:async()=>{
    const {mountJourneyPreview}=await import('./journey-preview.mjs');
    await mountJourneyPreview();
  },
  live:()=>Promise.all([
    import('../../shared/astrix-hero-cards.mjs'),
    import('./journey.mjs')
  ])
});
