import {
  consumeAiWorkbenchPolishInterruptedMarker,
  readAiWorkbenchSessionSnapshot,
  markAiWorkbenchPolishInterrupted,
  writeAiWorkbenchSessionSnapshot
} from '@/pages/question/Edit/hooks/ai/aiWorkbenchSessionStorage'

const createStorageMock = () => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
}

describe('aiWorkbenchSessionStorage', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: createStorageMock(),
        sessionStorage: createStorageMock()
      },
      writable: true,
      configurable: true
    })

    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('writes and reads the normalized session snapshot', () => {
    writeAiWorkbenchSessionSnapshot({
      questionnaireId: '12',
      activeConversationId: 8,
      mode: 'edit',
      composerInput: '补充一题满意度题',
      selectedModel: 'modelscope-qwen3-235b'
    })

    expect(readAiWorkbenchSessionSnapshot('12')).toEqual(
      expect.objectContaining({
        questionnaireId: '12',
        activeConversationId: 8,
        mode: 'edit',
        composerInput: '补充一题满意度题',
        selectedModel: 'modelscope-qwen3-235b'
      })
    )
  })

  it('returns null when the stored snapshot is invalid json', () => {
    window.localStorage.setItem('questionnaire-ai-workbench-session:12', '{bad-json')

    expect(readAiWorkbenchSessionSnapshot('12')).toBeNull()
  })

  it('normalizes missing fields when reading a partial snapshot', () => {
    window.localStorage.setItem(
      'questionnaire-ai-workbench-session:12',
      JSON.stringify({
        questionnaireId: '12'
      })
    )

    expect(readAiWorkbenchSessionSnapshot('12')).toEqual(
      expect.objectContaining({
        questionnaireId: '12',
        activeConversationId: null,
        mode: 'generate',
        composerInput: '',
        selectedModel: ''
      })
    )
  })

  it('consumes the polish interruption marker only once', () => {
    markAiWorkbenchPolishInterrupted('12')

    expect(consumeAiWorkbenchPolishInterruptedMarker('12')).toBe(true)
    expect(consumeAiWorkbenchPolishInterruptedMarker('12')).toBe(false)
  })
})
