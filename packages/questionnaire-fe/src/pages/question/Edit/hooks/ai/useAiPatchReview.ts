import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect } from 'react'
import { QuestionnaireDraft, QuestionnairePatchSet } from '../../components/aiCopilotTypes'
import {
  buildQuestionnairePatchSet,
  getReviewablePatches,
  getPatchStatus,
  reconcileSelectedPatchIds
} from '../aiQuestionPatch'
import { AiCopilotIntent } from '../../components/aiCopilotTypes'

type UseAiPatchReviewParams = {
  mode: AiCopilotIntent
  componentList: QuestionnaireDraft['components']
  pageConfig: Pick<QuestionnaireDraft, 'title' | 'description' | 'footerText'>
  draftPartial: QuestionnaireDraft | null
  finalDraft: QuestionnaireDraft | null
  questionPatchSet: QuestionnairePatchSet | null
  selectedPatchIds: string[]
  rejectedPatchIds: string[]
  baseVersionRef: { current: number }
  baseQuestionnaireRef: { current: QuestionnaireDraft | null }
  setDraftApplied: (value: boolean) => void
  setQuestionPatchSet: (value: QuestionnairePatchSet | null) => void
  setSelectedPatchIds: Dispatch<SetStateAction<string[]>>
  setRejectedPatchIds: Dispatch<SetStateAction<string[]>>
  applyPatchSelection: (patchIds?: string[]) => Promise<string[]>
  applyDraftInternal: () => Promise<void>
}

export const useAiPatchReview = ({
  mode,
  componentList,
  pageConfig,
  draftPartial,
  finalDraft,
  questionPatchSet,
  selectedPatchIds,
  rejectedPatchIds,
  baseVersionRef,
  baseQuestionnaireRef,
  setDraftApplied,
  setQuestionPatchSet,
  setSelectedPatchIds,
  setRejectedPatchIds,
  applyPatchSelection,
  applyDraftInternal
}: UseAiPatchReviewParams) => {
  useEffect(() => {
    const activeDraft = finalDraft || draftPartial
    const baseQuestionnaire = baseQuestionnaireRef.current

    if (!activeDraft || !baseQuestionnaire) {
      setQuestionPatchSet(null)
      setSelectedPatchIds([])
      setRejectedPatchIds([])
      return
    }

    const nextPatchSet = buildQuestionnairePatchSet({
      baseQuestionnaire,
      draftQuestionnaire: activeDraft,
      baseVersion: baseVersionRef.current
    })

    setQuestionPatchSet(nextPatchSet)
    setSelectedPatchIds(previousSelectedPatchIds =>
      reconcileSelectedPatchIds(previousSelectedPatchIds, nextPatchSet)
    )
    setRejectedPatchIds(previousRejectedPatchIds =>
      previousRejectedPatchIds.filter(patchId =>
        nextPatchSet.patches.some(patch => patch.id === patchId)
      )
    )
  }, [
    baseQuestionnaireRef,
    baseVersionRef,
    draftPartial,
    finalDraft,
    setQuestionPatchSet,
    setRejectedPatchIds,
    setSelectedPatchIds
  ])

  useEffect(() => {
    if (!questionPatchSet || questionPatchSet.patches.length === 0) return

    const currentQuestionnaire: QuestionnaireDraft = {
      title: pageConfig.title,
      description: pageConfig.description,
      footerText: pageConfig.footerText,
      components: componentList
    }
    const allPatchChangesApplied = questionPatchSet.patches.every(patch => {
      const patchStatus = getPatchStatus(
        currentQuestionnaire,
        patch,
        selectedPatchIds,
        rejectedPatchIds
      )
      return patchStatus === 'applied'
    })

    setDraftApplied(allPatchChangesApplied)
  }, [
    componentList,
    pageConfig.description,
    pageConfig.footerText,
    pageConfig.title,
    questionPatchSet,
    rejectedPatchIds,
    selectedPatchIds,
    setDraftApplied
  ])

  const togglePatchSelection = useCallback(
    (patchId: string) => {
      setSelectedPatchIds(previousSelectedPatchIds =>
        previousSelectedPatchIds.includes(patchId)
          ? previousSelectedPatchIds.filter(id => id !== patchId)
          : [...previousSelectedPatchIds, patchId]
      )
      setRejectedPatchIds(previousRejectedPatchIds =>
        previousRejectedPatchIds.filter(id => id !== patchId)
      )
    },
    [setRejectedPatchIds, setSelectedPatchIds]
  )

  const selectAllPatches = useCallback(() => {
    setSelectedPatchIds(
      getReviewablePatches(mode, questionPatchSet)
        .map(patch => patch.id)
        .filter(patchId => !rejectedPatchIds.includes(patchId))
    )
  }, [mode, questionPatchSet, rejectedPatchIds, setSelectedPatchIds])

  const clearPatchSelection = useCallback(() => {
    const reviewablePatchIds = new Set(
      getReviewablePatches(mode, questionPatchSet).map(patch => patch.id)
    )

    setSelectedPatchIds(previousSelectedPatchIds =>
      previousSelectedPatchIds.filter(patchId => !reviewablePatchIds.has(patchId))
    )
  }, [mode, questionPatchSet, setSelectedPatchIds])

  const applyPatchById = useCallback(
    async (patchId: string) => {
      setSelectedPatchIds(previousSelectedPatchIds =>
        previousSelectedPatchIds.filter(id => id !== patchId)
      )
      setRejectedPatchIds(previousRejectedPatchIds =>
        previousRejectedPatchIds.filter(id => id !== patchId)
      )

      const appliedPatchIds = await applyPatchSelection([patchId])
      if (appliedPatchIds.length === 0) return

      setSelectedPatchIds(previousSelectedPatchIds =>
        previousSelectedPatchIds.filter(id => !appliedPatchIds.includes(id))
      )
      setRejectedPatchIds(previousRejectedPatchIds =>
        previousRejectedPatchIds.filter(id => !appliedPatchIds.includes(id))
      )
    },
    [applyPatchSelection, setRejectedPatchIds, setSelectedPatchIds]
  )

  const rejectPatchById = useCallback(
    (patchId: string) => {
      setSelectedPatchIds(previousSelectedPatchIds =>
        previousSelectedPatchIds.filter(id => id !== patchId)
      )
      setRejectedPatchIds(previousRejectedPatchIds =>
        previousRejectedPatchIds.includes(patchId)
          ? previousRejectedPatchIds.filter(id => id !== patchId)
          : [...previousRejectedPatchIds, patchId]
      )
    },
    [setRejectedPatchIds, setSelectedPatchIds]
  )

  const applyDraft = useCallback(async () => {
    await applyDraftInternal()
    setSelectedPatchIds(previousSelectedPatchIds =>
      previousSelectedPatchIds.filter(
        patchId =>
          !questionPatchSet?.patches.some(patch => patch.id === patchId) ||
          rejectedPatchIds.includes(patchId)
      )
    )
  }, [applyDraftInternal, questionPatchSet, rejectedPatchIds, setSelectedPatchIds])

  return {
    togglePatchSelection,
    selectAllPatches,
    clearPatchSelection,
    applyPatchById,
    rejectPatchById,
    applyDraft
  }
}
