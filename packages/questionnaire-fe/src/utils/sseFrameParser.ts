export type ParsedSseFrame<TData = unknown> = {
  event: string
  data: TData | string | null
}

const parseSseData = <TData>(dataText: string): TData | string => {
  try {
    return JSON.parse(dataText) as TData
  } catch {
    return dataText
  }
}

export const parseSseChunk = <TData>(chunk: string): ParsedSseFrame<TData> => {
  let event = 'message'
  const dataLines: string[] = []

  chunk.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith(':')) return

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      return
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
    }
  })

  const dataText = dataLines.join('\n')
  return {
    event,
    data: dataText ? parseSseData<TData>(dataText) : null
  }
}

export const consumeSseBuffer = <TData>(
  buffer: string,
  onFrame: (frame: ParsedSseFrame<TData>) => void
) => {
  let normalizedBuffer = buffer.replace(/\r\n/g, '\n')
  let separatorIndex = normalizedBuffer.indexOf('\n\n')

  while (separatorIndex >= 0) {
    const chunk = normalizedBuffer.slice(0, separatorIndex)
    normalizedBuffer = normalizedBuffer.slice(separatorIndex + 2)

    if (chunk.trim()) {
      onFrame(parseSseChunk<TData>(chunk))
    }

    separatorIndex = normalizedBuffer.indexOf('\n\n')
  }

  return normalizedBuffer
}
