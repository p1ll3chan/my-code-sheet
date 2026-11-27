// Reused by retrieval and coverage: one current shared source per key. A revoked
// latest source cannot silently fall back to an older authorization.
export function knowledgeCtes(includeSynthetic = false) {
  return `source as (
    select distinct on (s.problem_key) s.* from problem_statements s
    where s.scope='shared' and s.source_kind ${includeSynthetic ? "in ('operator-approved','synthetic-fixture')" : "='operator-approved'"}
    order by s.problem_key,s.created_at desc,s.id desc
  ), permitted as (select * from source where revoked_at is null and processing_allowed and sharing_allowed),
  evidence_flags as (
    select v.id,
      (v.status='proof-reviewed' and v.candidate->>'disposition'='complete'
        and not exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.outcome='fail')
        and exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.method='sample' and e.outcome='pass')
        and exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.method='independent-critique' and e.outcome<>'fail')
        and exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.method='human-proof-review' and e.outcome='pass')) as proof_reviewed,
      (exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.method='sample-execution' and e.outcome='pass' and e.evidence->>'analysisHash'=v.candidate_hash)
        and exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.method='differential-execution' and e.outcome='pass' and e.evidence->>'analysisHash'=v.candidate_hash)
        and exists(select 1 from reasoning_verification_results e where e.analysis_id=v.id and e.method='human-training-review' and e.outcome='pass' and e.evidence->>'analysisHash'=v.candidate_hash
          and e.evidence->'concepts'=(select jsonb_agg(jsonb_build_object('concept_id',pc.concept_id,'weight',pc.weight,'facet',rc.facet,'status',rc.status) order by pc.concept_id) from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=v.id))
        and v.candidate->'uncertainties'='[]'::jsonb
        and exists(select 1 from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=v.id and rc.status='active' and rc.facet='primary-discovery')
        and not exists(select 1 from problem_concept_relationships pc join reasoning_concepts rc on rc.id=pc.concept_id where pc.analysis_id=v.id and rc.status<>'active')) as training_evidence
    from reasoning_analysis_versions v
  ), current_versions as (
    select v.*, s.source_kind, s.attribution, s.source_ref, s.grant_ref, s.content_hash, j.mode, j.model_id, j.prompt_version,
      f.proof_reviewed, (f.proof_reviewed and f.training_evidence) as training_ready
    from reasoning_analysis_versions v join permitted s on s.id=v.statement_id join analysis_jobs j on j.id=v.job_id
      join evidence_flags f on f.id=v.id
    where ${includeSynthetic ? "(s.source_kind='synthetic-fixture' or j.mode='live')" : "j.mode='live'"}
  )`;
}
