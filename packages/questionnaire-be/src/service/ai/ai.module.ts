import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AnswerModule } from '@/service/answer/answer.module';
import { EditorModule } from '@/service/editor/editor.module';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';
import Question from '@/service/question/entities/question.entity';

@Module({
  controllers: [AiController],
  providers: [AiService],
  imports: [
    TypeOrmModule.forFeature([
      AiConversation,
      AiMessage,
      AiAttachment,
      Question,
    ]),
    AnswerModule,
    EditorModule,
  ],
})
export class AiModule {}
