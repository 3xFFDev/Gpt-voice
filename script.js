'use strict'

const synchronize = {

    isHumanSpeechActive: false,
    isMachineSpeechActive: false
}

class HumanSpeech {

    #flow = {

        speechLanguage:    null,
        chatInput:         null,
        listener:          null
    };

    constructor(language) {

        this.#flow.speechLanguage = language;

    }

    #triggerCtrlEnter(node) {

        const enterKeyDown = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        });

        node.dispatchEvent(enterKeyDown);

        const enterKeyUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        });

        node.dispatchEvent(enterKeyUp);
    }

    #getChatInput(maxRetries = 10) {

        let retries = 0;

        return new Promise((resolve, reject) => {

            const intervalId = setInterval( () => {

                const chatForm = document.querySelector('form[aria-haspopup="dialog"]');

                if (chatForm) {

                    const chatInput = chatForm.querySelector('div[contenteditable="true"] > p');

                    if (chatInput) {

                        clearInterval(intervalId);

                        this.#flow.chatInput = chatInput;

                        resolve(true);
                    }
                }

                retries++;

                if (retries >= maxRetries) {

                    clearInterval(intervalId);

                    reject(false);
                }

            }, 1000);
        });
    };

    async init() {

        let intervalId = null;

        if(await this.#getChatInput()) {

            this.#flow.listener = new webkitSpeechRecognition();

            this.#flow.listener.continuous = true;

            this.#flow.listener.lang = this.#flow.speechLanguage;

            this.#flow.listener.onresult = (e) => {

                this.#flow.chatInput.focus();

                this.#flow.chatInput.innerText += e.results[e.results.length - 1][0].transcript;

                const inputEvent = new Event('input', { bubbles: true, cancelable: true });

                this.#flow.chatInput.dispatchEvent(inputEvent);

                setTimeout(() => {

                    this.#triggerCtrlEnter(this.#flow.chatInput);

                    this.#flow.listener.stop();

                }, 2000);
            };

            this.#flow.listener.onend = () => {

                synchronize.isHumanSpeechActive = false;

                console.info(`[Human:init] 0:`, synchronize);
            };

            this.#flow.listener.onerror = () => {

                synchronize.isHumanSpeechActive = false;

                console.info(`[Human:init] 1:`, synchronize);
            };

            intervalId = setInterval(async () => {

                if(!synchronize.isMachineSpeechActive && !synchronize.isHumanSpeechActive) {

                    synchronize.isHumanSpeechActive = true;

                    console.info(`[Human:init] 2:`, synchronize);

                    try {

                        this.#flow.listener.start();

                    } catch (err) {

                        console.log(err);
                    }
                }

            }, 10000);
        }

        chrome.storage.onChanged.addListener((changes) => {

            if('isHumanSpeechActive' in changes && changes.isHumanSpeechActive.newValue === false) {

                if(intervalId) clearInterval(intervalId);

                synchronize.isHumanSpeechActive = false;

                console.info(`[Human:init] 3:`, synchronize);

                this.#flow.listener.stop();
            }

            if('isMachineSpeechActive' in changes && changes.isMachineSpeechActive.newValue === true)  {

                if(!synchronize.isMachineSpeechActive && !synchronize.isHumanSpeechActive) synchronize.isHumanSpeechActive = true;

                console.info(`[Human:init] 4:`, synchronize);

                this.#flow.listener.start();
            }
        });
    }
}

class MachineSpeech {

    #flow = {

        messagesContainer: null,
        speechTrigger:     null,
        mutationObserver:  null,
        reader:            null,
        speechLanguage:    null,
        chunkSize:         200,
        mutationsDebounce: 10000,
        debounceTimeoutId: null,
        mutationCounter: 0
    };

    constructor(language) {

        this.#flow.messagesContainer = document.getElementsByTagName('main')[0] || null;

        this.#flow.reader = window.speechSynthesis;

        this.#flow.speechLanguage = language;
    }

    #splitToChunks(sentence) {

        const words = sentence.split(' ');

        let chunk0 = '', chunk1 = '';

        for (const word of words) {

            if (chunk0.length + word.length + 1 <= this.#flow.chunkSize) {

                chunk0 += (chunk0.length ? ' ' : '') + word;

            } else {

                chunk1 += (chunk1.length ? ' ' : '') + word;
            }
        }

        return [chunk0.trim(), chunk1.trim()];
    };

    #transformChunk(text, voice) {

        const utterance = new SpeechSynthesisUtterance(text);

        utterance.lang = this.#flow.speechLanguage;

        utterance.voice = voice;

        utterance.pitch = 1;

        return utterance;
    };

    async #findAvailableVoice(maxRetries = 10) {

        let retries = 0;

        return new Promise((resolve, reject) => {

            const intervalId = setInterval(() => {

                const voicesPack = this.#flow.reader.getVoices();

                if (voicesPack.length !== 0) {

                    const voice = voicesPack.find(voice => voice.lang === this.#flow.speechLanguage);

                    if (voice) {

                        clearInterval(intervalId);

                        resolve(voice);
                    }
                }

                retries++;

                if (retries >= maxRetries) {

                    clearInterval(intervalId);

                    reject(new Error(`No available voices found.`));
                }

            }, 10);
        });
    };

    async #getUtterances(cachedReadableText) {

        const sentences = cachedReadableText.split(/[.!?]/), utterances = [], voice = await this.#findAvailableVoice();

        for (let i = 0; i < sentences.length; i++) {

            const sentence = sentences[i].trim();

            if(!sentence.length) continue;

            if(sentence.length <= this.#flow.chunkSize) {

                utterances.push(this.#transformChunk(sentence, voice));

            } else {

                const [chunk0, chunk1] = this.#splitToChunks(sentence);

                if(chunk0.length > 0) utterances.push(this.#transformChunk(chunk0, voice));

                if(chunk1.length > 0) utterances.push(this.#transformChunk(chunk1, voice));
            }
        }

        return utterances;
    };

    #readUtterances(index, utterances) {

        if (index >= utterances.length) {

            synchronize.isMachineSpeechActive = false;

            console.info(`[Machine:readUtterances] 5`, synchronize);

            return;
        }

        const utterance = utterances[index];

        utterance.addEventListener('end', () => {

            this.#readUtterances(index + 1, utterances);
        });

        utterance.onerror = (err) => {

            synchronize.isMachineSpeechActive = false;

            localStorage.removeItem('cachedReadableText');

            console.info(`[Machine:readUtterances] 6:`, synchronize);

            console.info(err);
        }

        this.#flow.reader.cancel();

        this.#flow.reader.speak(utterance);
    };

    async #readText(cachedReadableText) {

        const utterances = await this.#getUtterances(cachedReadableText);

        this.#readUtterances(0, utterances);
    };

    #createSpeechTrigger() {

        this.#flow.speechTrigger = document.createElement('button');

        this.#flow.speechTrigger.innerText = 'Speech';

        this.#flow.speechTrigger.onclick = async () => {

            this.#flow.speechTrigger.style.cssText = 'display: none;';

            const cachedReadableText = localStorage.getItem('cachedReadableText');

            if(cachedReadableText) await this.#readText(cachedReadableText);
        };

        document.body.appendChild(this.#flow.speechTrigger);
    };

    #parseMessageContent(messageContent) {

        const readableTags = ['UL', 'P', 'OL'];

        const filteredContent =  Array.from(messageContent[0].children).filter(i => readableTags.includes(i.tagName));

        return filteredContent.map(i => {

            if(i.tagName === 'UL' || i.tagName === 'OL') {

                let innerText = '';

                i.querySelectorAll('li').forEach(li => {

                    innerText += ` ${li.innerText.trim()}`;
                });

                return innerText.trim();
            }

            return i.innerText.trim();

        }).join(' ');
    }

    #isMachineMessage(message) {

        const speakerMark = message.getElementsByClassName('sr-only')[0];

        return /ChatGPT/gi.test(speakerMark.innerText);
    };

    async #handleLastMessage () {

        const chatMessages = this.#flow.messagesContainer.getElementsByTagName('article');

        if(!chatMessages.length) {

            synchronize.isMachineSpeechActive = false;

            console.info(`[Machine:handleLastMessage] 1:`, synchronize);

            return;
        }

        const lastMessage = chatMessages[chatMessages.length - 1];

        if(this.#isMachineMessage(lastMessage)) {

            const messageContent = lastMessage.querySelectorAll('.markdown.prose');

            if(!messageContent.length) {

                synchronize.isMachineSpeechActive = false;

                console.info(`[Machine:handleLastMessage] 2:`, synchronize);

                return;
            }

            const readableText = this.#parseMessageContent(messageContent);

            if(!readableText.length) {

                synchronize.isMachineSpeechActive = false;

                console.info(`[Machine:handleLastMessage] 3:`, synchronize);

                return;
            }

            this.#flow.mutationCounter = 0;

            const cachedReadableText = localStorage.getItem('cachedReadableText');

            if(cachedReadableText && cachedReadableText !== readableText) {

                console.info('Speech with hidden trigger.');

                localStorage.setItem('cachedReadableText', readableText);

                this.#flow.speechTrigger.style.cssText = 'display: none;';

                this.#flow.speechTrigger.click();

            } else if(!cachedReadableText ) {

                console.info('Confirmation speech to pass browser restriction.');

                localStorage.setItem('cachedReadableText', readableText);

                this.#flow.speechTrigger.style.cssText = 'display: block; border: 2px solid #ffffff; background: #222831; color: #ffffff; width: 100px; height: 100px; position: absolute; top: calc(50% - 50px); left: calc(50% - 50px); border-radius: 50%;';

            } else {

                synchronize.isMachineSpeechActive = false;

                console.info(`[Machine:handleLastMessage] 4:`, synchronize);
            }
        }
    };

    #mutationObserverHandler = async (mutations) => {

        if(this.#flow.debounceTimeoutId) clearTimeout(this.#flow.debounceTimeoutId);

        ++this.#flow.mutationCounter;

        if(!synchronize.isHumanSpeechActive && !synchronize.isMachineSpeechActive) {

            synchronize.isMachineSpeechActive = true;

            console.info(`[Machine:mutationObserverHandler] 0:`, synchronize);
        }

        this.#flow.debounceTimeoutId = setTimeout(async () => {

            await this.#handleLastMessage();

        }, this.#flow.mutationsDebounce + this.#flow.mutationCounter * 10);
    };

    #createMutationObserver(node) {

        const observerOptions = {

            childList:  true,
            subtree:    true
        };

        this.#flow.mutationObserver = new MutationObserver(this.#mutationObserverHandler);

        this.#flow.mutationObserver.observe(node, observerOptions);
    };

    async init() {

        try {

            this.#createSpeechTrigger();

            this.#createMutationObserver(this.#flow.messagesContainer);

            chrome.storage.onChanged.addListener((changes) => {

                if('isMachineSpeechActive' in changes && changes.isMachineSpeechActive.newValue === false) {

                    this.#flow.mutationObserver.disconnect();

                    this.#flow.mutationObserver = null;

                    localStorage.removeItem('cachedReadableText');

                    console.log('Mutation observer disconnected.');
                }

                if('isMachineSpeechActive' in changes && changes.isMachineSpeechActive.newValue === true)  {

                    this.#createMutationObserver(this.#flow.messagesContainer);

                    console.log('Mutation observer connected.');
                }
            });

        } catch (err) {

            console.error(err);
        }
    };
}

window.onload = () => {

    chrome.storage.local.get(['speechLanguage', 'isMachineSpeechActive', 'isHumanSpeechActive']).then(async (result) => {

        if(result['isMachineSpeechActive']) {

            const machineSpeaker = new MachineSpeech(result['speechLanguage']);

            await machineSpeaker.init();
        }

        if(result['isHumanSpeechActive']) {

            const humanSpeaker = new HumanSpeech(result['speechLanguage']);

            await humanSpeaker.init();
        }
    });
};
