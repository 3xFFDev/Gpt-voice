window.onload = () => {

    const speechLanguageSelect = document.getElementById('speech-language'),

          machineSpeechCheckbox = document.getElementById('machine-speech-status'),

          humanSpeechCheckbox = document.getElementById('human-speech-status');

    chrome.storage.local.get(['speechLanguage', 'isMachineSpeechActive', 'isHumanSpeechActive']).then((result) => {

        speechLanguageSelect.value = result['speechLanguage'] || 'en-US';

        machineSpeechCheckbox.checked = !!result?.['isMachineSpeechActive'];

        humanSpeechCheckbox.checked = !!result?.['isHumanSpeechActive'];
    });

    machineSpeechCheckbox.onchange = (e) => {

        chrome.storage.local.set({ 'isMachineSpeechActive': e.target.checked });
    }

    humanSpeechCheckbox.onchange = (e) => {

        chrome.storage.local.set({ 'isHumanSpeechActive': e.target.checked });
    }

    speechLanguageSelect.onchange = (e) => {

        chrome.storage.local.set({'speechLanguage': e.target.value });
    }
}

