let ws = null;
let audioContext = null;
let mediaStream = null;
let audioWorkletNode = null;
let isRecording = false;

const appendedTexts = new Set();

const $ = (id) => document.getElementById(id);
const recordBtn = $('recordBtn');
const statusIndicator = $('statusIndicator');
const statusText = $('statusText');
const transcriptBox = $('transcript');
const responseBox = $('response');
const logsBox = $('logs');

const WS_URL = 'ws://localhost:8080/realtime';

recordBtn.addEventListener('click', toggleRecording);
$('clearLogsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    logsBox.innerHTML = '';
});

async function connectWebSocket() {
    try {
        addLog('Connecting to server...', 'info');
        ws = new WebSocket(WS_URL);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            addLog('Connected to server', 'success');
            updateStatus('connected', 'Connected');
            recordBtn.disabled = false;
            sendToServer({
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: 'You are a helpful voice assistant. Answer briefly and clearly.',
                    voice: 'alloy',
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    input_audio_transcription: { model: 'whisper-1' },
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500
                    }
                }
            });
        };

        ws.onmessage = async (event) => {
            if (typeof event.data === 'string') {
                try {
                    handleServerMessage(JSON.parse(event.data));
                } catch (e) {
                    addLog(`Failed to process message: ${e.message}`, 'warning');
                }
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            addLog(`WebSocket error: ${error.message || 'Unknown error'}`, 'error');
        };

        ws.onclose = (event) => {
            addLog(`Disconnected (Code: ${event.code})`, event.wasClean ? 'warning' : 'error');
            updateStatus('disconnected', 'Disconnected');
            recordBtn.disabled = true;
            if (isRecording) stopRecording();
        };
    } catch (error) {
        addLog(`Connection error: ${error.message}`, 'error');
    }
}

function handleServerMessage(data) {
    addLog(`Event: ${data.type}`, 'info');

    if (data.type === 'error') {
        addLog(`Server error: ${data.error?.message || 'Unknown error'}`, 'error');
        return;
    }

    if (data.type === 'session.created' || data.type === 'session.updated') {
        addLog(data.type === 'session.created' ? 'Session created' : 'Session updated', 'success');
        return;
    }

    // User speech transcription
    if (data.type === 'conversation.item.created' && data.item?.role === 'user') {
        data.item.content?.forEach(c => {
            const text = c.transcript || c.text;
            if (text) {
                appendToBox(transcriptBox, text, data.type);
            }
        });
        return;
    }

    if (data.type === 'conversation.item.input_audio_transcription.completed' ||
        data.type === 'conversation.item.input_audio_transcription.delta') {
        const chunk = data.transcript || data.delta;
        if (chunk) {
            appendToBox(transcriptBox, chunk, data.type);
        }
        return;
    }

    // AI response text/transcript deltas
    if (data.type === 'response.audio_transcript.delta' ||
        data.type === 'response.transcript.delta' ||
        data.type === 'response.text.delta' ||
        data.type === 'response.delta' ||
        data.type === 'response.output_text.delta') {
        const chunk = data.delta || data.transcript || data.text;
        if (chunk) {
            appendToBox(responseBox, chunk, data.type);
        }
        return;
    }

    // AI response final text
    if (data.type === 'response.output_text.done' && data.text) {
        appendToBox(responseBox, data.text, data.type);
        return;
    }

    if (data.type === 'response.done') {
        if (data.response?.status === 'failed') {
            const errMsg = data.response.status_details?.error?.message || 'Response failed';
            addLog(`Assistant failed: ${errMsg}`, 'error');
            appendToBox(responseBox, `[Error] ${errMsg}`);
        }
        addLog('Response received', 'success');
    }
}

async function toggleRecording() {
    isRecording ? stopRecording() : await startRecording();
}

async function startRecording() {
    try {
        addLog('Starting audio recording...', 'info');

        if (audioContext) {
            await audioContext.close().catch(() => {});
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        const track = mediaStream.getAudioTracks()[0];
        const micSampleRate = track.getSettings().sampleRate || 48000;

        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: micSampleRate });
        const source = audioContext.createMediaStreamSource(mediaStream);

        await audioContext.audioWorklet.addModule(createAudioWorkletCode());
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor', {
            processorOptions: { inputSampleRate: micSampleRate, targetSampleRate: 24000 }
        });

        audioWorkletNode.port.onmessage = (event) => {
            if (isRecording && ws?.readyState === WebSocket.OPEN) {
                sendToServer({
                    type: 'input_audio_buffer.append',
                    audio: arrayBufferToBase64(event.data)
                });
            }
        };

        const silenceGain = audioContext.createGain();
        silenceGain.gain.value = 0;
        source.connect(audioWorkletNode).connect(silenceGain).connect(audioContext.destination);

        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.record-text').textContent = 'Stop Recording';
        updateStatus('recording', 'Recording...');
        addLog('Recording started', 'success');
    } catch (error) {
        addLog(`Error starting recording: ${error.message}`, 'error');
        console.error('Recording error:', error);
    }
}

function stopRecording() {
    isRecording = false;

    if (audioWorkletNode?.port) audioWorkletNode.port.onmessage = null;
    mediaStream?.getTracks().forEach(track => track.stop());
    audioWorkletNode?.disconnect();
    audioContext?.close();

    mediaStream = audioWorkletNode = audioContext = null;

    if (ws?.readyState === WebSocket.OPEN) {
        sendToServer({ type: 'input_audio_buffer.commit' });
        sendToServer({ type: 'response.create', response: { modalities: ['text'] } });
    }

    recordBtn.classList.remove('recording');
    recordBtn.querySelector('.record-text').textContent = 'Start Recording';
    updateStatus('connected', 'Connected');
    addLog('Recording stopped', 'info');
}

function createAudioWorkletCode() {
    const code = `
        class AudioProcessor extends AudioWorkletProcessor {
            constructor(options) {
                super();
                const opts = options.processorOptions || {};
                this.inputSampleRate = opts.inputSampleRate || sampleRate;
                this.targetSampleRate = opts.targetSampleRate || 24000;
            }

            resample(floatInput) {
                const inRate = this.inputSampleRate;
                const outRate = this.targetSampleRate;

                if (inRate === outRate) {
                    const int16 = new Int16Array(floatInput.length);
                    for (let i = 0; i < floatInput.length; i++) {
                        int16[i] = Math.max(-1, Math.min(1, floatInput[i])) * 32767 | 0;
                    }
                    return int16;
                }

                const ratio = inRate / outRate;
                const outLen = Math.floor(floatInput.length / ratio);
                const int16 = new Int16Array(outLen);

                for (let i = 0; i < outLen; i++) {
                    const src = i * ratio;
                    const src0 = Math.floor(src);
                    const src1 = Math.min(floatInput.length - 1, src0 + 1);
                    const frac = src - src0;
                    const s0 = floatInput[src0] || 0;
                    const s1 = floatInput[src1] || 0;
                    const sample = s0 + (s1 - s0) * frac;
                    int16[i] = Math.max(-1, Math.min(1, sample)) * 32767 | 0;
                }
                return int16;
            }

            process(inputs) {
                const input = inputs[0]?.[0];
                if (input?.length) {
                    const int16 = this.resample(input);
                    this.port.postMessage(int16.buffer, [int16.buffer]);
                }
                return true;
            }
        }
        registerProcessor('audio-processor', AudioProcessor);
    `;
    return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function sendToServer(data) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function updateStatus(status, text) {
    statusText.textContent = text;
    statusIndicator.className = 'status-badge ' + status;
}

function appendToBox(box, text, eventType) {
    if (appendedTexts.has(text)) {
        console.log(`Duplicate text ignored from event ${eventType}: ${text}`);
        return;
    }

    appendedTexts.add(text);
    if (box.querySelector('.placeholder')) box.innerHTML = '';
    box.textContent += text;
    box.scrollTop = box.scrollHeight;
    console.log(`Appended text from event ${eventType}: ${text}`);
}

function addLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${message}`;
    logsBox.appendChild(logEntry);
    logsBox.scrollTop = logsBox.scrollHeight;
}

addLog('Application loaded', 'success');
window.addEventListener('load', connectWebSocket);