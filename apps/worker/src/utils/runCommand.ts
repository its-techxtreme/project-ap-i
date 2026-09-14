import { spawn } from 'node:child_process'

import { resolveBinary } from './resolveBinary'

export interface RunCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

/** Spawn a CLI without execa. tsx + unicorn-magic blows up on Node 22/24 exports. */
export async function runCommand(
  file: string,
  args: string[],
  options?: { timeout?: number; cwd?: string },
): Promise<RunCommandResult> {
  const resolved = await resolveBinary(file)

  return new Promise((resolve, reject) => {
    const child = spawn(resolved, args, {
      cwd: options?.cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer =
      options?.timeout !== undefined
        ? setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
          }, options.timeout)
        : undefined

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`Command timed out after ${options?.timeout}ms: ${file}`))
        return
      }
      if (code !== 0) {
        const detail = (stderr || stdout).trim()
        reject(new Error(`${file} exited with code ${code}${detail ? `: ${detail}` : ''}`))
        return
      }
      resolve({ stdout, stderr, exitCode: code })
    })
  })
}
