import process from 'node:process';
import { createInterface } from 'node:readline';
import { handleWorkerEnvelope, type WorkerEnvelope, type WorkerMessage } from './service.js';

const input = createInterface({ input: process.stdin, terminal: false });
input.once('line', (line) => {
  input.close();
  void run(line);
});

async function run(line: string) {
  const send = (message: WorkerMessage) => process.stdout.write(`${JSON.stringify(message)}\n`);
  try {
    const envelope = JSON.parse(line) as WorkerEnvelope;
    await handleWorkerEnvelope(envelope, send);
  } catch {
    send({
      type: 'error',
      payload: { code: 'INVALID_PAYLOAD', message: 'The desktop bridge request was invalid.' },
    });
  }
}
