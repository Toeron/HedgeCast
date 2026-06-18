
import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const summarizeText = async (text: string): Promise<string> => {
  try {
    const prompt = `Je bent een deskundige nieuwsanalist. Maak een beknopte, boeiende audio-samenvatting van het volgende nieuwsartikel in het Nederlands. De samenvatting moet gemakkelijk te beluisteren en te begrijpen. Richt je op de belangrijkste punten en presenteer ze in een duidelijke, verhalende stijl. Hier is de inhoud van het artikel: \n\n"${text}"`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Error summarizing text:", error);
    throw new Error("Failed to generate summary. The AI service may be unavailable.");
  }
};

export const generateSpeech = async (text: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!base64Audio) {
            throw new Error("No audio data returned from the API.");
        }

        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("Failed to generate audio. The TTS service may be unavailable.");
    }
};
