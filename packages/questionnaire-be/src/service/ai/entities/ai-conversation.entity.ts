import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';

@Entity()
class AiConversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  questionnaire_id: number;

  @Column()
  user_id: number;

  @Column({ length: 120, default: '未命名会话' })
  title: string;

  @Column({ length: 20, default: 'generate' })
  intent: 'generate' | 'edit';

  @Column({ default: false })
  is_pinned: boolean;

  @Column({ length: 120, nullable: true })
  last_model: string | null;

  @Column({ type: 'text', nullable: true })
  last_instruction: string | null;

  @Column({ type: 'simple-json', nullable: true })
  latest_draft: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  latest_summary: Record<string, any> | null;

  @Column({ default: 0 })
  message_count: number;

  @Column({ default: 0 })
  attachment_count: number;

  @Column({ type: 'datetime', nullable: true })
  latest_activity_at: Date | null;

  @CreateDateColumn()
  create_time: Date;

  @UpdateDateColumn()
  update_time: Date;

  @OneToMany(() => AiMessage, (message) => message.conversation)
  messages: AiMessage[];

  @OneToMany(() => AiAttachment, (attachment) => attachment.conversation)
  attachments: AiAttachment[];
}

export default AiConversation;
