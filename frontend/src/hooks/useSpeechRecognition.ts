import { useState, useEffect, useCallback, useRef } from 'react';

type SpeechRecognitionConstructor = new () => any;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browserWindow = window as SpeechRecognitionWindow;
      const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const r = new SpeechRecognition();
        r.continuous = true;
        r.interimResults = true;
        r.lang = 'en-US';

        r.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              onResultRef.current(transcript + ' ');
            }
          }
        };

        r.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
        };

        r.onend = () => {
          setIsListening(false);
        };

        setRecognition(r);
      }
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognition) {
      console.warn('Speech recognition is not supported in your browser.');
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  }, [recognition, isListening]);

  const stopListening = useCallback(() => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  }, [recognition, isListening]);

  return {
    isListening,
    toggleListening,
    stopListening,
    supported: !!recognition
  };
}
