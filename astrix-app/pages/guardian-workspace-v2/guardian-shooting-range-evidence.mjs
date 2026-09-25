const asString=value=>String(value??'').trim();
const positiveHash=value=>Number.isInteger(Number(value))&&Number(value)>0?Number(value):null;

function captureMatchesCharacter(capture,characterId){
  const capturedCharacterId=asString(capture?.characterId);
  const currentCharacterId=asString(characterId);
  return Boolean(capturedCharacterId&&currentCharacterId&&capturedCharacterId===currentCharacterId);
}

function mergeCaptureArchive(archive=[],capture=null,limit=5){
  const max=Math.max(1,Number(limit)||5);
  const testId=asString(capture?.testId);
  const previous=(Array.isArray(archive)?archive:[]).filter(row=>asString(row?.testId));
  if(!testId)return previous.slice(0,max);
  return [{...capture},...previous.filter(row=>asString(row.testId)!==testId)].slice(0,max);
}

function periodAtOrAfterArmed(period,armedAt){
  const periodMs=Date.parse(asString(period));
  const armedMs=Date.parse(asString(armedAt));
  return Number.isFinite(periodMs)&&Number.isFinite(armedMs)&&periodMs>=armedMs-5000;
}

function selectCandidateActivities({activities=[],baselineInstanceIds=[],armedAt='',baselineAvailable=true}={}){
  const baseline=new Set((baselineInstanceIds||[]).map(asString).filter(Boolean));
  return (Array.isArray(activities)?activities:[])
    .filter(activity=>{
      const instanceId=asString(activity?.instanceId);
      if(!instanceId||!periodAtOrAfterArmed(activity?.period,armedAt))return false;
      return baselineAvailable?!baseline.has(instanceId):true;
    })
    .map(activity=>({
      ...activity,
      candidateBasis:baselineAvailable?'new-instance-after-baseline':'timestamp-only-baseline-unavailable',
      candidateConfidence:baselineAvailable?'corroborated':'limited'
    }));
}

function activityMatchesExpectation(activity,expectation={}){
  const expected={
    activityHash:positiveHash(expectation.activityHash),
    activityTypeHash:positiveHash(expectation.activityTypeHash),
    mode:positiveHash(expectation.mode)
  };
  const hasExpectation=Object.values(expected).some(Boolean);
  if(!hasExpectation)return false;
  const activityModes=new Set([positiveHash(activity?.mode),...(activity?.modes||[]).map(positiveHash)].filter(Boolean));
  return (!expected.activityHash||expected.activityHash===positiveHash(activity?.referenceId)||expected.activityHash===positiveHash(activity?.directorActivityHash))&&
    (!expected.activityTypeHash||expected.activityTypeHash===positiveHash(activity?.activityTypeHash))&&
    (!expected.mode||activityModes.has(expected.mode));
}

function chooseCandidateActivity(candidates=[],expectation={}){
  const rows=Array.isArray(candidates)?candidates:[];
  const exact=rows.filter(row=>activityMatchesExpectation(row?.activity||row,expectation));
  if(exact.length===1)return {status:'auto-selected-exact-match',selectedInstanceId:asString(exact[0]?.activity?.instanceId||exact[0]?.instanceId),requiresUserConfirmation:false,choices:rows};
  return {
    status:rows.length?'user-confirmation-required':'no-candidate',
    selectedInstanceId:null,
    requiresUserConfirmation:rows.length>0,
    choices:rows,
    exactMatchCount:exact.length
  };
}

function classifyCandidateEvidence({activity=null,pgcr=null,error=null}={}){
  const referenceId=positiveHash(activity?.referenceId);
  const directorActivityHash=positiveHash(activity?.directorActivityHash);
  const pgcrReferenceId=positiveHash(pgcr?.activityDetails?.referenceId);
  const pgcrDirectorActivityHash=positiveHash(pgcr?.activityDetails?.directorActivityHash);
  const hasHashIdentity=Boolean(referenceId&&directorActivityHash);
  const hasPgcr=Boolean(pgcr&&typeof pgcr==='object');
  const hasPgcrHashIdentity=Boolean(pgcrReferenceId&&pgcrDirectorActivityHash);
  const hashAgreement=hasHashIdentity&&hasPgcrHashIdentity&&
    pgcrReferenceId===referenceId&&
    pgcrDirectorActivityHash===directorActivityHash;
  let classification='unproven-activity-candidate';
  if(error)classification='pgcr-unavailable';
  else if(hasPgcr&&!hasHashIdentity)classification='pgcr-without-activity-hash-identity';
  else if(hasPgcr&&!hasPgcrHashIdentity)classification='pgcr-without-pgcr-hash-identity';
  else if(hasPgcr&&!hashAgreement)classification='activity-pgcr-hash-mismatch';
  else if(hasPgcr&&hasHashIdentity&&hasPgcrHashIdentity&&hashAgreement)classification='verified-activity-pgcr-evidence';
  return {
    classification,
    shootingRangeIdentification:'unverified',
    proof:{
      hasInstanceId:Boolean(asString(activity?.instanceId)),
      hasReferenceId:Boolean(referenceId),
      hasDirectorActivityHash:Boolean(directorActivityHash),
      hasPgcr,
      hasPgcrReferenceId:Boolean(pgcrReferenceId),
      hasPgcrDirectorActivityHash:Boolean(pgcrDirectorActivityHash),
      hasPgcrHashIdentity,
      hashAgreement
    }
  };
}

function summarizeCaptureEvidence(results=[]){
  const rows=Array.isArray(results)?results:[];
  return {
    candidateCount:rows.length,
    verifiedActivityPgcrCount:rows.filter(row=>row?.evidence?.classification==='verified-activity-pgcr-evidence').length,
    pgcrUnavailableCount:rows.filter(row=>row?.evidence?.classification==='pgcr-unavailable').length,
    shootingRangeIdentified:false,
    conclusion:rows.length
      ?'Activity list loaded. Shooting Range details are unavailable.'
      :'No post-arm activity candidate was found.'
  };
}

export {captureMatchesCharacter,mergeCaptureArchive,periodAtOrAfterArmed,selectCandidateActivities,activityMatchesExpectation,chooseCandidateActivity,classifyCandidateEvidence,summarizeCaptureEvidence};
