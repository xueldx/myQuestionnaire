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
class AiMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  conversation_id: number;

  @Column({ length: 20 })
  role: 'user' | 'assistant' | 'tool';

  @Column({ length: 24, default: 'chat' })
  kind: 'chat' | 'tool_call' | 'tool_result';

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 80, nullable: true })
  tool_name: string | null;

  @Column({ type: 'simple-json', nullable: true })
  meta: Record<string, any> | null;

  @CreateDateColumn()
  create_time: Date;

  @ManyToOne(() => AiConversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: AiConversation;
}

export default AiMessage;
