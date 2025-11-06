import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';

@Entity()
class AiAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  conversation_id: number;

  @Column()
  questionnaire_id: number;

  @Column()
  user_id: number;

  @Column({ length: 255 })
  original_name: string;

  @Column({ length: 255 })
  file_name: string;

  @Column({ length: 255 })
  file_url: string;

  @Column({ length: 120, nullable: true })
  mime_type: string | null;

  @Column()
  size: number;

  @Column({ length: 16 })
  extension: string;

  @Column({ type: 'longtext', nullable: true })
  content_text: string | null;

  @CreateDateColumn()
  create_time: Date;

  @ManyToOne(() => AiConversation, (conversation) => conversation.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: AiConversation;
}

export default AiAttachment;
