/**
 * Pipeline module barrel export.
 */

export { TransactionPipeline, type PipelineDeps } from './pipeline.js';
export { DefaultPolicyEngine } from './default-policy-engine.js';
export {
  stage1Validate,
  stage2Auth,
  stage3Policy,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
  type PipelineContext,
} from './stages.js';
