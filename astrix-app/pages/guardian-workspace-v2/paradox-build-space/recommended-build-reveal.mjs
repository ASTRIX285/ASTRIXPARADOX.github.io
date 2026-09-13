async function revealRecommendedBuild({build,dialog,body,renderReview,paint,onRenderError,focusTarget}={}){
  if(!build?.recommendationGeneratedAt||!dialog)return {opened:false,renderError:null};
  dialog.hidden=false;
  dialog.setAttribute?.('aria-hidden','false');
  body?.classList?.add('recommended-build-open');
  await Promise.resolve(paint?.());
  let renderError=null;
  try{renderReview?.(build);}
  catch(error){renderError=error instanceof Error?error:new Error(String(error));onRenderError?.(renderError);}
  focusTarget?.focus?.();
  return {opened:true,renderError};
}

export {revealRecommendedBuild};
