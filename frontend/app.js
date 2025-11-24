// WebSocket connection
let ws = null;
let audioContext = null;
let mediaStream = null;
let audioWorkletNode = null;
let isRecording = false;

// DOM elements
const recordBtn = document.getElementById('recordBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const transcriptBox = document.getElementById('transcript');
const responseBox = document.getElementById('response');
const logsBox = document.getElementById('logs');
const clearLogsBtn = document.getElementById('clearLogsBtn');

// WebSocket URL - change to your server address
const WS_URL = 'ws://localhost:8000/realtime';

// Event listeners
recordBtn.addEventListener('click', toggleRecording);
clearLogsBtn.addEventListener('click', clearLogs);

// Connect to WebSocket
async function connectWebSocket() {
    try {
        addLog('Connecting to server...', 'info');

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            addLog('Connected to server', 'success');
            updateStatus('connected', 'Connected');
            // auto-managed UI: enable recording when connected
            recordBtn.disabled = false;

            // Send initial session configuration
            sendSessionConfig();
        };

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) {
                addLog(`Received message: ${event.data.substring(0, 100)}...`, 'info');
            }
        };

        ws.onerror = (error) => {
            addLog(`WebSocket error: ${error.message || 'Unknown error'}`, 'error');
        };

        ws.onclose = () => {
            addLog('Disconnected from server', 'warning');
            updateStatus('disconnected', 'Disconnected');
            recordBtn.disabled = true;

            if (isRecording) {
                stopRecording();
            }
        };

    } catch (error) {
        addLog(`Connection error: ${error.message}`, 'error');
    }
}

// Disconnect from WebSocket
function disconnectWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }

    if (isRecording) {
        stopRecording();
    }
}

// Send session configuration to OpenAI
function sendSessionConfig() {
    const config = {
        type: 'session.update',
        session: {
            modalities: ['text', 'audio'],
            instructions: 'You are a helpful voice assistant. Answer briefly and clearly.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500
            }
        }
    };

    sendToServer(config);
}

// Handle messages from server
function handleServerMessage(data) {
    addLog(`Event: ${data.type}`, 'info');

    switch (data.type) {
        case 'session.created':
            addLog('Session created', 'success');
            break;

        case 'session.updated':
            addLog('Session updated', 'success');
            break;

        case 'conversation.item.created':
            if (data.item?.content) {
                addLog('Conversation item created', 'info');
            }
            break;

        case 'response.audio_transcript.delta':
            if (data.delta) {
                appendToTranscript(data.delta);
            }
            break;

        case 'response.audio.delta':
            // Handle audio response if needed
            break;

        case 'response.text.delta':
            if (data.delta) {
                appendToResponse(data.delta);
            }
            break;

        case 'response.done':
            addLog('Response received completely', 'success');
            break;

        case 'error':
            addLog(`Server error: ${data.error?.message || 'Unknown error'}`, 'error');
            break;
    }
}

// Toggle recording
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// Start recording audio
async function startRecording() {
    try {
        addLog('Starting audio recording...', 'info');

        // Get microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 24000
            }
        });

        // Create audio context
        audioContext = new AudioContext({ sampleRate: 24000 });
        const source = audioContext.createMediaStreamSource(mediaStream);

        // Create audio processor
        await audioContext.audioWorklet.addModule(createAudioWorkletCode());
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');

        audioWorkletNode.port.onmessage = (event) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const audioData = {
                    type: 'input_audio_buffer.append',
                    audio: arrayBufferToBase64(event.data)
                };
                sendToServer(audioData);
            }
        };

        source.connect(audioWorkletNode);
        audioWorkletNode.connect(audioContext.destination);

        isRecording = true;
        recordBtn.textContent = '⏹ Stop Recording';
        recordBtn.classList.add('recording');
        updateStatus('recording', 'Recording...');
        addLog('Recording started', 'success');

    } catch (error) {
        addLog(`Error starting recording: ${error.message}`, 'error');
    }
}

// Stop recording audio
function stopRecording() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioWorkletNode) {
        audioWorkletNode.disconnect();
        audioWorkletNode = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    isRecording = false;
    recordBtn.textContent = '🎤 Start Recording';
    recordBtn.classList.remove('recording');
    updateStatus('connected', 'Connected');
    addLog('Recording stopped', 'info');
}

// Create AudioWorklet processor code
function createAudioWorkletCode() {
    const processorCode = `
        class AudioProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (input.length > 0) {
                    const audioData = input[0];
                    const int16Data = new Int16Array(audioData.length);
                    for (let i = 0; i < audioData.length; i++) {
                        int16Data[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
                    }
                    this.port.postMessage(int16Data.buffer);
                }
                return true;
            }
        }
        registerProcessor('audio-processor', AudioProcessor);
    `;

    const blob = new Blob([processorCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Send data to server
function sendToServer(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Update status indicator
function updateStatus(status, text) {
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator ' + status;
}

// Append to transcript
function appendToTranscript(text) {
    if (transcriptBox.querySelector('.placeholder')) {
        transcriptBox.innerHTML = '';
    }
    transcriptBox.textContent += text;
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

// Append to response
function appendToResponse(text) {
    if (responseBox.querySelector('.placeholder')) {
        responseBox.innerHTML = '';
    }
    responseBox.textContent += text;
    responseBox.scrollTop = responseBox.scrollHeight;
}

// Add log entry
function addLog(message, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logsBox.appendChild(logEntry);
    logsBox.scrollTop = logsBox.scrollHeight;
}

// Clear logs
function clearLogs() {
    logsBox.innerHTML = '';
}

// Initialize
addLog('Application loaded', 'success');

// Auto-connect on load
window.addEventListener('load', () => {
    connectWebSocket();
});
