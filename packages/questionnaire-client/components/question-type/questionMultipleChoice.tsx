"use client";

import React from "react";
import { Checkbox, CheckboxGroup } from "@heroui/checkbox";
import { Question } from "@/types/question";
import useAnswerStore from "@/stores/useAnswerStore";

const EMPTY_ARRAY: string[] = [];

const QuestionCheckbox = ({ question }: { question: Question }) => {
  const addOrUpdateAnswer = useAnswerStore(state => state.addOrUpdateAnswer);

  // 使用 Zustand selector 订阅特定题目的答案变化，避免不必要的重新渲染或状态不同步
  const selected = useAnswerStore(state => {
    const currentAnswers = state.answersByQuestionnaire[state.currentQuestionnaireId] || EMPTY_ARRAY;
    const answer = currentAnswers.find(a => String(a.fe_id) === String(question.fe_id));
    return Array.isArray(answer?.value) ? (answer.value as string[]) : EMPTY_ARRAY;
  });

  const handleSelectionChange = (values: string[]) => {
    addOrUpdateAnswer(question.fe_id, values, question.type);
  };

  return (
    <CheckboxGroup label={question.question} value={selected} onValueChange={handleSelectionChange}>
      {(question.options ?? []).map(answer => (
        <Checkbox color="secondary" key={answer} value={answer}>
          {answer}
        </Checkbox>
      ))}
    </CheckboxGroup>
  );
};

export default QuestionCheckbox;
