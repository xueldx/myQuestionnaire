import React from 'react'
import { QuestionnairePatchStatus } from '../hooks/aiQuestionPatch'
import { PatchActionButtons, PreviewCard } from './AiInlinePreviewShared'
import { AiPreviewCardEntry } from './aiInlinePreviewModel'

interface AiInlinePreviewCardListProps {
  entries: AiPreviewCardEntry[]
  reviewActionsDisabled: boolean
  onSelectComponent: (feId: string) => void
  onApplyPatch: (patchId: string) => void
  onRejectPatch: (patchId: string) => void
  getCardRef?: (cardId: string) => (node: HTMLDivElement | null) => void
  onCardInteract?: (cardId: string) => void
}

const AiInlinePreviewCardList: React.FC<AiInlinePreviewCardListProps> = ({
  entries,
  reviewActionsDisabled,
  onSelectComponent,
  onApplyPatch,
  onRejectPatch,
  getCardRef,
  onCardInteract
}) => (
  <div className="mt-5 space-y-4">
    {entries.map(entry => (
      <PreviewCard
        key={entry.cardId}
        cardId={entry.cardId}
        cardRef={getCardRef?.(entry.cardId)}
        scrollMarginTop={112}
        label={entry.label}
        note={entry.note}
        tone={entry.tone}
        component={entry.component}
        selected={entry.selected}
        selectedAccent={entry.selectedAccent}
        onInteract={() => onCardInteract?.(entry.cardId)}
        onSelect={entry.isSelectable ? () => onSelectComponent(entry.feId) : undefined}
        extra={
          entry.patchId ? (
            <PatchActionButtons
              status={(entry.patchStatus || 'pending') as QuestionnairePatchStatus}
              onAccept={() => onApplyPatch(entry.patchId as string)}
              onReject={() => onRejectPatch(entry.patchId as string)}
              disabled={reviewActionsDisabled}
            />
          ) : undefined
        }
      />
    ))}
  </div>
)

export default AiInlinePreviewCardList
