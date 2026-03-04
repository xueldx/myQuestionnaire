import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_request_metric')
@Index(['user_id', 'started_at'])
@Index(['questionnaire_id', 'started_at'])
class AiRequestMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 80, unique: true })
  request_id: string;

  @Column()
  conversation_id: number;

  @Column()
  questionnaire_id: number;

  @Column()
  user_id: number;

  @Column({ length: 20 })
  intent: 'generate' | 'edit';

  @Column({ length: 20 })
  workflow_stage: 'polish' | 'generate' | 'edit';

  @Column({ length: 120 })
  model_key: string;

  @Column({ length: 255 })
  provider_base_url: string;

  @Column({ length: 40 })
  context_strategy: string;

  @Column({ length: 32 })
  status:
    | 'running'
    | 'done'
    | 'error'
    | 'cancelled'
    | 'timeout'
    | 'disconnect_timeout';

  @Column({ length: 32, nullable: true })
  stop_reason:
    | 'cancel'
    | 'timeout'
    | 'disconnect'
    | 'disconnect_timeout'
    | null;

  @Column({ type: 'datetime' })
  started_at: Date;

  @Column({ type: 'datetime', nullable: true })
  first_token_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finished_at: Date | null;

  @Column({ type: 'int', nullable: true })
  duration_ms: number | null;

  @Column({ type: 'int', nullable: true })
  ttft_ms: number | null;

  @Column({ length: 24, nullable: true })
  usage_source: 'provider_exact' | 'estimator' | null;

  @Column({ type: 'int', nullable: true })
  prompt_tokens: number | null;

  @Column({ type: 'int', nullable: true })
  completion_tokens: number | null;

  @Column({ type: 'int', nullable: true })
  total_tokens: number | null;

  @Column({ type: 'int', nullable: true })
  cached_tokens: number | null;

  @Column({ type: 'int', default: 0 })
  parse_warning_count: number;

  @Column({ default: false })
  draft_ready: boolean;

  @Column({ type: 'int', default: 0 })
  draft_component_count: number;

  @Column({ default: false })
  draft_applied: boolean;

  @Column({ default: false })
  discarded: boolean;

  @Column({ default: false })
  auto_save_succeeded: boolean;

  @Column({ default: false })
  auto_save_failed: boolean;

  @Column({ type: 'simple-json', nullable: true })
  context_snapshot: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  usage_snapshot: Record<string, any> | null;

  @CreateDateColumn()
  create_time: Date;

  @UpdateDateColumn()
  update_time: Date;
}

export default AiRequestMetric;
