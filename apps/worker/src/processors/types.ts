export interface ProcessInput {
  jobId: string
  sourcePath: string
  tempDir: string
  watermarkPath: string
}

export interface ProcessOutput {
  outputPath: string
  fileSize: number
}

export interface Processor {
  process(input: ProcessInput): Promise<ProcessOutput>
}
