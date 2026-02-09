const API_BASE = window.API_BASE || "http://localhost:8000";

const DEFAULT_PROMPT =
  'Return ONLY the cleaned text with NO preamble.\n\nExample:\nInput: "um so like I was thinking, you know, maybe we could, uh, create a function that, um, basically does the calculations, right?"\nOutput: "I think we should create a function that does the calculations."';

const recordBtn = document.getElementById("recordBtn");
const recordStatus = document.getElementById("recordStatus");
const fileInput = document.getElementById("fileInput");
const textInput = document.getElementById("textInput");
const processTextBtn = document.getElementById("processTextBtn");
const systemPrompt = document.getElementById("systemPrompt");
const originalOutput = document.getElementById("originalOutput");
const cleanedOutput = document.getElementById("cleanedOutput");
const copyBtn = document.getElementById("copyBtn");

let mediaRecorder = null;
let mediaStream = null;
let chunks = [];
let isRecording = false;
let recordingMimeType = "";

systemPrompt.value = DEFAULT_PROMPT;

function setStatus(message, isError = false) {
  recordStatus.textContent = message;
  recordStatus.classList.toggle("error", isError);
}

function setRecordingState(active) {
  isRecording = active;
  recordBtn.classList.toggle("active", active);
  recordBtn.querySelector(".label").textContent = active
    ? "Stop Recording"
    : "Start Recording";
}

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording() {
  if (isRecording) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone not supported in this browser.", true);
    return;
  }
  if (typeof MediaRecorder === "undefined") {
    setStatus("Recording is not supported in this browser.", true);
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingMimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(
      mediaStream,
      recordingMimeType ? { mimeType: recordingMimeType } : undefined,
    );
    chunks = [];

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      const blob = new Blob(chunks, {
        type: recordingMimeType || "audio/webm",
      });
      if (!blob.size) {
        setStatus("No audio captured. Please try again.", true);
        cleanupRecording();
        return;
      }
      const extension = recordingMimeType.includes("ogg")
        ? "ogg"
        : recordingMimeType.includes("mp4")
          ? "m4a"
          : "webm";
      await handleAudio(blob, `recording.${extension}`);
      cleanupRecording();
    });

    mediaRecorder.start(250);
    setRecordingState(true);
    setStatus("Recording...");
  } catch (error) {
    setStatus("Microphone access denied or unavailable.", true);
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  if (mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  setRecordingState(false);
  setStatus("Processing recording...");
}

function cleanupRecording() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
  mediaStream = null;
  mediaRecorder = null;
  chunks = [];
  setStatus("");
}

async function handleAudio(blob, filename) {
  if (!blob) return;
  try {
    setStatus("Transcribing...");
    const formData = new FormData();
    formData.append("file", blob, filename);

    const response = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    originalOutput.value = data.text || "";
    await cleanText(data.text || "");
  } catch (error) {
    setStatus(
      `Transcription failed: ${error?.message || "Check the API server."}`,
      true,
    );
  }
}

async function cleanText(text) {
  if (!text.trim()) {
    setStatus("Nothing to clean yet.", true);
    return;
  }

  try {
    setStatus("Cleaning transcript...");
    const response = await fetch(`${API_BASE}/clean`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        system_prompt: systemPrompt.value.trim(),
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    cleanedOutput.value = data.text || "";
    setStatus("");
  } catch (error) {
    setStatus(
      `Cleaning failed: ${error?.message || "Check the API server."}`,
      true,
    );
  }
}

recordBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "v" && !isRecording) {
    startRecording();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key.toLowerCase() === "v" && isRecording) {
    stopRecording();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    handleAudio(file, file.name);
    fileInput.value = "";
  }
});

processTextBtn.addEventListener("click", () => {
  const text = textInput.value.trim();
  originalOutput.value = text;
  cleanText(text);
});

copyBtn.addEventListener("click", async () => {
  if (!cleanedOutput.value) return;
  await navigator.clipboard.writeText(cleanedOutput.value);
  setStatus("Copied cleaned transcript.");
  setTimeout(() => setStatus(""), 1200);
});
