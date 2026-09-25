import {startPage} from '../../shared/local-preview.mjs?v=20260925-local-preview-1';
// Never import the live modules in preview: auth has import-time side effects.
await startPage({
  preview:async()=>{
    const {mountJourneyPreview}=await import('./journey-preview.mjs?v=20260925-local-preview-1');
    await mountJourneyPreview();
  },
  live:()=>Promise.all([
    import('../../shared/astrix-hero-cards.mjs?v=20260913-workspace-preload-1&transport=20260911-compact-plugs-1&navigation=20260919-1&reports=20260925-1'),
    import('./journey.mjs?v=20260913-workspace-preload-1&recovery=20260917-renderable-2&transport=20260911-compact-plugs-1&identity=20260918-emblem-card-1&navigation=20260919-1&maps=20260920-zoom-chests-3&champion=20260924-champion-export-1&activity=20260918-activity-startup-1')
  ])
});
