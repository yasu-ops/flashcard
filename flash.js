        let questionSets = [];
        let currentSet = null;
        let currentQuestions = [];
        let filteredQuestions = [];
        let currentQuestionIndex = 0;
        let memoryStatus = [];
        let currentFilter = 'all';

        // 初期化
        async function init() {
            try {
                await loadQuestionSets();
                renderMainScreen();
            } catch (error) {
                console.error('初期化エラー:', error);
                showError('問題・正解セットの一覧.csvファイルを読み込めませんでした。<br>ファイルが同じフォルダにあることを確認してください。');
            }
        }

        // エラー表示
        function showError(message) {
            document.getElementById('sets-container').innerHTML = 
                `<div class="error">${message}</div>`;
        }

        // CSVファイルの読み込み
        async function loadCSV(filename) {
            return new Promise((resolve, reject) => {
                Papa.parse(filename, {
                    download: true,
                    header: false,
                    skipEmptyLines: true,
                    dynamicTyping: true,
                    delimitersToGuess: [',', '\t', '|', ';'],
                    complete: function(results) {
                        if (results.errors.length > 0) {
                            reject(new Error(`CSVパースエラー: ${results.errors[0].message}`));
                        } else {
                            resolve(results.data);
                        }
                    },
                    error: function(error) {
                        reject(new Error(`ファイル読み込みエラー: ${error.message}`));
                    }
                });
            });
        }

        // 問題セット一覧の読み込み
        async function loadQuestionSets() {
            const csvData = await loadCSV('問題・正解セットの一覧.csv');
            
            questionSets = [];
            for (let i = 0; i < csvData.length; i++) {
                const row = csvData[i];
                if (row.length >= 4) {
                    const set = {
                        id: parseInt(row[0]) || (i + 1),
                        title: (row[1] || '').toString().trim(),
                        filename: (row[2] || '').toString().trim(),
                        questionCount: parseInt(row[3]) || 0
                    };
                    
                    if (set.title && set.filename && set.questionCount > 0) {
                        questionSets.push(set);
                    }
                }
            }

            if (questionSets.length === 0) {
                throw new Error('有効な問題セットが見つかりませんでした。');
            }

            // 各セットの暗記状況を初期化
            for (let set of questionSets) {
                const statusKey = `フラッシュカード${set.id}`;
                let status = localStorage.getItem(statusKey);
                
                if (!status) {
                    // 初期状態（全て未着手）
                    status = Array(set.questionCount).fill(0).join(',');
                    localStorage.setItem(statusKey, status);
                }
                
                set.memoryStatus = status.split(',').map(Number);
                
                // データの整合性チェック
                if (set.memoryStatus.length !== set.questionCount) {
                    set.memoryStatus = Array(set.questionCount).fill(0);
                    localStorage.setItem(statusKey, set.memoryStatus.join(','));
                }
                
                // 統計を計算
                const counts = [0, 0, 0]; // 未着手, 未暗記, 暗記済み
                set.memoryStatus.forEach(s => {
                    const status = parseInt(s);
                    if (status >= 0 && status <= 2) {
                        counts[status]++;
                    }
                });
                set.untouchedCount = counts[0];
                set.notMemorizedCount = counts[1]; 
                set.completedCount = counts[2];
            }
        }

        // メイン画面のレンダリング
        function renderMainScreen() {
            const container = document.getElementById('sets-container');
            container.innerHTML = '';

            if (questionSets.length === 0) {
                showError('問題セットが見つかりません。');
                return;
            }

            questionSets.forEach(set => {
                const setDiv = document.createElement('div');
                setDiv.className = 'set-item';
                
                setDiv.innerHTML = `
                    <div class="set-header">${set.id}. ${set.title}</div>
                    <div class="status">
                        <button class="total-btn" onclick="startStudyWithFilter(${set.id}, 'all', 'card')">全問: ${set.questionCount}</button>
                        <button class="untouched-btn" onclick="startStudyWithFilter(${set.id}, 0, 'card')">未着手: ${set.untouchedCount}</button>
                        <button class="not-memorized-btn" onclick="startStudyWithFilter(${set.id}, 1, 'card')">未暗記: ${set.notMemorizedCount}</button>
                        <button class="completed-btn" onclick="startStudyWithFilter(${set.id}, 2, 'card')">暗記済み: ${set.completedCount}</button>
                        <div class="view-mode-selector">
                            <input type="radio" id="main-card-mode-${set.id}" name="main-view-mode-${set.id}" value="card" checked onchange="updateMainViewMode(${set.id})">
                            <label for="main-card-mode-${set.id}">カード</label>
                            <input type="radio" id="main-list-mode-${set.id}" name="main-view-mode-${set.id}" value="list" onchange="updateMainViewMode(${set.id})">
                            <label for="main-list-mode-${set.id}">一覧</label>
                        </div>
                    </div>
                `;
                
                container.appendChild(setDiv);
            });
        }

        // メイン画面でのビューモード更新
        function updateMainViewMode(setId) {
            const viewMode = document.querySelector(`input[name="main-view-mode-${setId}"]:checked`).value;
            // ボタンクリック時のデフォルトビューモードを更新
            const buttons = document.querySelectorAll(`[onclick*="startStudyWithFilter(${setId}"]`);
            buttons.forEach(button => {
                const onclick = button.getAttribute('onclick');
                const newOnclick = onclick.replace(/, '[^']*'\)$/, `, '${viewMode}')`);
                button.setAttribute('onclick', newOnclick);
            });
        }

        // 問題セットの読み込み
        async function loadQuestionSet(setId) {
            const set = questionSets.find(s => s.id === setId);
            if (!set) {
                throw new Error(`問題セット${setId}が見つかりません。`);
            }

            try {
                const csvData = await loadCSV(set.filename);
                const questions = [];
                
                for (let i = 0; i < csvData.length; i++) {
                    const row = csvData[i];
                    if (row.length >= 3) {
                        questions.push({
                            number: parseInt(row[0]) || (i + 1),
                            question: (row[1] || '').toString().trim(),
                            answer: (row[2] || '').toString().trim(),
                            explanation: row.length >= 4 ? (row[3] || '').toString().trim() : ''
                        });
                    }
                }
                
                if (questions.length === 0) {
                    throw new Error('問題データが見つかりませんでした。');
                }
                
                return questions;
            } catch (error) {
                throw new Error(`問題ファイル「${set.filename}」の読み込みに失敗しました: ${error.message}`);
            }
        }

        // フィルターと表示モードに基づいて学習開始
        async function startStudyWithFilter(setId, filter, viewMode) {
            try {
                currentSet = questionSets.find(set => set.id === setId);
                currentQuestions = await loadQuestionSet(setId);
                memoryStatus = [...currentSet.memoryStatus];
                currentFilter = filter;
                
                // フィルタリング
                filteredQuestions = currentQuestions.filter((q, index) => {
                    switch (filter) {
                        case 'all': return true;
                        case 0: return memoryStatus[index] === 0; // 未着手
                        case 1: return memoryStatus[index] === 1; // 未暗記
                        case 2: return memoryStatus[index] === 2; // 暗記済み
                        default: return true;
                    }
                });
                
                if (filteredQuestions.length === 0) {
                    alert('対象となる問題がありません。');
                    return;
                }
                
                if (viewMode === 'card') {
                    startCardMode();
                } else {
                    startListMode();
                }
                
            } catch (error) {
                console.error('学習開始エラー:', error);
                alert(`エラーが発生しました: ${error.message}`);
            }
        }

        // カードモード開始
        function startCardMode() {
            currentQuestionIndex = 0;
            
            document.getElementById('main-screen').style.display = 'none';
            document.getElementById('list-screen').style.display = 'none';
            document.getElementById('study-screen').style.display = 'block';
            
            // UI更新
            document.getElementById('study-title').textContent = currentSet.title;
            document.getElementById('study-total-count').textContent = currentSet.questionCount;
            
            // ラジオボタンを設定
            document.getElementById('study-card-mode').checked = true;
            document.getElementById('study-list-mode').checked = false;
            
            updateStudyScreen();
            updateActiveFilterButton();
        }

        // リストモード開始
        function startListMode() {
            document.getElementById('main-screen').style.display = 'none';
            document.getElementById('study-screen').style.display = 'none';
            document.getElementById('list-screen').style.display = 'block';
            
            document.getElementById('list-title').textContent = currentSet.title;
            document.getElementById('list-total-count').textContent = currentSet.questionCount;
            
            // ラジオボタンを設定
            document.getElementById('list-card-mode').checked = false;
            document.getElementById('list-list-mode').checked = true;
            
            updateStatusCounts();
            renderQuestionList();
            updateActiveFilterButton();
        }

        // フィルターと表示形式の組み合わせ処理
        function filterAndDisplay(filter, viewMode) {
            currentFilter = filter;
            
            // フィルタリング
            filteredQuestions = currentQuestions.filter((q, index) => {
                switch (filter) {
                    case 'all': return true;
                    case 0: return memoryStatus[index] === 0; // 未着手
                    case 1: return memoryStatus[index] === 1; // 未暗記
                    case 2: return memoryStatus[index] === 2; // 暗記済み
                    default: return true;
                }
            });
            
            if (filteredQuestions.length === 0) {
                alert('対象となる問題がありません。');
                return;
            }
            
            if (viewMode === 'card') {
                currentQuestionIndex = 0;
                document.getElementById('list-screen').style.display = 'none';
                document.getElementById('study-screen').style.display = 'block';
                
                // ラジオボタンを設定
                document.getElementById('study-card-mode').checked = true;
                document.getElementById('study-list-mode').checked = false;
                
                updateStudyScreen();
            } else {
                document.getElementById('study-screen').style.display = 'none';
                document.getElementById('list-screen').style.display = 'block';
                
                // ラジオボタンを設定
                document.getElementById('list-card-mode').checked = false;
                document.getElementById('list-list-mode').checked = true;
                
                renderQuestionList();
            }
            updateActiveFilterButton();
        }

        // 現在の表示モードを取得
        function getViewMode() {
            if (document.getElementById('study-screen').style.display === 'block') {
                return document.querySelector('input[name="study-view-mode"]:checked').value;
            } else {
                return document.querySelector('input[name="list-view-mode"]:checked').value;
            }
        }

        // 学習画面の更新
        function updateStudyScreen() {
            if (filteredQuestions.length === 0) return;
            
            const currentQ = filteredQuestions[currentQuestionIndex];
            const originalIndex = currentQuestions.findIndex(q => q.number === currentQ.number);
            
            document.getElementById('study-title').textContent = currentSet.title;
            // 問題表示（HTMLタグを解釈）
            document.getElementById('question-text').innerHTML = currentQ.question;
            document.getElementById('answer-text').innerHTML = currentQ.answer;
            document.getElementById('explanation-text').innerHTML = currentQ.explanation;
            document.getElementById('answer-text').style.display = 'none';
            document.getElementById('explanation-text').style.display = 'none';
            document.getElementById('toggle-answer').textContent = '正解を見て分類する';
            document.getElementById('toggle-explanation').style.display = 'none';
            document.getElementById('toggle-explanation').textContent = '解説を表示';
            
            // 進捗表示
            document.getElementById('current-question').textContent = currentQuestionIndex + 1;
            document.getElementById('total-questions').textContent = filteredQuestions.length;
            
            // ラジオボタンの設定
            const status = memoryStatus[originalIndex];
            document.querySelectorAll('input[name="status"]').forEach(radio => {
                radio.checked = radio.value == status;
            });
            
            // ナビゲーションボタン
            const prevBtn = document.getElementById('prev-question');
            const nextBtn = document.getElementById('next-question');
            
            if (currentQuestionIndex <= 0) {
                prevBtn.disabled = true;
            } else {
                prevBtn.disabled = false;
            }
            
            if (currentQuestionIndex >= filteredQuestions.length - 1) {
                nextBtn.disabled = true;
            } else {
                nextBtn.disabled = false;
            }
                
            updateStatusCounts();
        }

        // 統計の更新
        function updateStatusCounts() {
            const counts = [0, 0, 0];
            memoryStatus.forEach(s => counts[s]++);
            
            // 学習画面用
            document.getElementById('completed-count').textContent = counts[2];
            document.getElementById('not-memorized-count').textContent = counts[1];
            document.getElementById('untouched-count').textContent = counts[0];
            document.getElementById('study-total-count').textContent = currentSet.questionCount;
            
            // リスト画面用
            document.getElementById('list-completed-count').textContent = counts[2];
            document.getElementById('list-not-memorized-count').textContent = counts[1];
            document.getElementById('list-untouched-count').textContent = counts[0];
            document.getElementById('list-total-count').textContent = currentSet.questionCount;
        }

        // アクティブなフィルターボタンを更新
        function updateActiveFilterButton() {
            // すべてのstatusボタンからactiveクラスを削除
            document.querySelectorAll('.status button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // 現在のフィルターに対応するボタンにactiveクラスを追加
            const isStudyScreen = document.getElementById('study-screen').style.display === 'block';
            const isListScreen = document.getElementById('list-screen').style.display === 'block';
            
            let targetClass;
            switch(currentFilter) {
                case 'all':
                    targetClass = 'total-btn';
                    break;
                case 0:
                    targetClass = 'untouched-btn';
                    break;
                case 1:
                    targetClass = 'not-memorized-btn';
                    break;
                case 2:
                    targetClass = 'completed-btn';
                    break;
            }
            
            // 現在表示中の画面のボタンにactiveクラスを追加
            if (isStudyScreen) {
                document.querySelectorAll(`#study-status .${targetClass}`).forEach(btn => btn.classList.add('active'));
            } else if (isListScreen) {
                document.querySelectorAll(`#list-status .${targetClass}`).forEach(btn => btn.classList.add('active'));
            }
        }

        // 問題一覧のレンダリング
        function renderQuestionList() {
            
            const listContainer = document.getElementById('questions-list');
            listContainer.innerHTML = '';
            document.getElementById('list-title').textContent = currentSet.title;

            filteredQuestions.forEach((question, displayIndex) => {
                const originalIndex = currentQuestions.findIndex(q => q.number === question.number);
                const questionDiv = document.createElement('div');
                questionDiv.className = 'question-list-item';
                
                questionDiv.innerHTML = `
                    <div class="question-content">
                        <strong>${question.number}:</strong> ${question.question}
                        <div id="answer-${question.number}" style="display: none; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px;">${question.answer}</div>
                        <div id="explanation-${question.number}" style="display: none; margin-top: 10px; padding: 10px; background: #fff3cd; border-radius: 5px;">${question.explanation}</div>
                    </div>
                    <div class="controls">
                        <div class="radio-group">
                            <div class="radio-item">
                                <input type="radio" id="list-untouched-${question.number}" name="list-status-${question.number}" value="0" ${memoryStatus[originalIndex] === 0 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 0)">
                                <label for="list-untouched-${question.number}"><span class="label-untouched">未着手</span></label>
                            </div>
                            <div class="radio-item">
                                <input type="radio" id="list-not-memorized-${question.number}" name="list-status-${question.number}" value="1" ${memoryStatus[originalIndex] === 1 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 1)">
                                <label for="list-not-memorized-${question.number}"><span class="label-not-memorized">未暗記</span></label>
                            </div>
                            <div class="radio-item">
                                <input type="radio" id="list-completed-${question.number}" name="list-status-${question.number}" value="2" ${memoryStatus[originalIndex] === 2 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 2)">
                                <label for="list-completed-${question.number}"><span class="label-completed">暗記済み</span></label>
                            </div>
                        </div>
                        <button class="success-btn" onclick="toggleQuestionAnswer(${question.number})">正解表示</button>
                        <button class="warning-btn" id="explanation-btn-${question.number}" onclick="toggleQuestionExplanation(${question.number})" style="display: none;">解説表示</button>
                    </div>
                `;
                
                listContainer.appendChild(questionDiv);
            });
        }

        // 問題の暗記状況更新
        function updateQuestionStatus(questionIndex, status) {
            memoryStatus[questionIndex] = status;
            
            // ローカルストレージ更新
            const statusKey = `フラッシュカード${currentSet.id}`;
            localStorage.setItem(statusKey, memoryStatus.join(','));
            
            // 統計更新
            updateStatusCounts();
            
            // メイン画面のセット情報も更新
            const counts = [0, 0, 0];
            memoryStatus.forEach(s => counts[s]++);
            currentSet.untouchedCount = counts[0];
            currentSet.notMemorizedCount = counts[1];
            currentSet.completedCount = counts[2];
        }

        // 問題一覧での正解表示切り替え
        function toggleQuestionAnswer(questionNumber) {
            const answerDiv = document.getElementById(`answer-${questionNumber}`);
            const explanationBtn = document.getElementById(`explanation-btn-${questionNumber}`);
            const button = event.target;
            
            if (answerDiv.style.display === 'none') {
                answerDiv.style.display = 'block';
                button.textContent = '正解を隠す';
                // 解説がある場合のみ解説ボタンを表示
                const question = currentQuestions.find(q => q.number === questionNumber);
                if (question && question.explanation) {
                    explanationBtn.style.display = 'inline-block';
                }
            } else {
                answerDiv.style.display = 'none';
                button.textContent = '正解表示';
                // 解説ボタンを非表示
                explanationBtn.style.display = 'none';
                // 解説も非表示
                const explanationDiv = document.getElementById(`explanation-${questionNumber}`);
                explanationDiv.style.display = 'none';
                explanationBtn.textContent = '解説表示';
            }
        }

        // 問題一覧での解説表示切り替え
        function toggleQuestionExplanation(questionNumber) {
            const explanationDiv = document.getElementById(`explanation-${questionNumber}`);
            const button = document.getElementById(`explanation-btn-${questionNumber}`);
            
            if (explanationDiv.style.display === 'none') {
                explanationDiv.style.display = 'block';
                button.textContent = '解説非表示';
            } else {
                explanationDiv.style.display = 'none';
                button.textContent = '解説表示';
            }
        }

        // イベントリスナーの設定
        document.addEventListener('DOMContentLoaded', function() {
            init();
            
            // メイン画面に戻る
            document.getElementById('back-to-main').addEventListener('click', function() {
                document.getElementById('study-screen').style.display = 'none';
                document.getElementById('list-screen').style.display = 'none';
                document.getElementById('main-screen').style.display = 'block';
                renderMainScreen();
            });
            
            document.getElementById('back-to-main-from-list').addEventListener('click', function() {
                document.getElementById('study-screen').style.display = 'none';
                document.getElementById('list-screen').style.display = 'none';
                document.getElementById('main-screen').style.display = 'block';
                renderMainScreen();
            });
            
            // 学習画面のイベント
            document.getElementById('toggle-answer').addEventListener('click', function() {
                const answerDiv = document.getElementById('answer-text');
                const explanationBtn = document.getElementById('toggle-explanation');
                if (answerDiv.style.display === 'none') {
                    answerDiv.style.display = 'block';
                    this.textContent = '正解を隠す';
                    // 解説がある場合のみ解説ボタンを表示
                    const currentQ = filteredQuestions[currentQuestionIndex];
                    if (currentQ && currentQ.explanation) {
                        explanationBtn.style.display = 'inline-block';
                    }
                } else {
                    answerDiv.style.display = 'none';
                    this.textContent = '正解を見て分類する';
                    // 解説ボタンを非表示
                    explanationBtn.style.display = 'none';
                    // 解説も非表示
                    const explanationDiv = document.getElementById('explanation-text');
                    explanationDiv.style.display = 'none';
                    explanationBtn.textContent = '解説を表示';
                }
            });
            
            document.getElementById('toggle-explanation').addEventListener('click', function() {
                const explanationDiv = document.getElementById('explanation-text');
                if (explanationDiv.style.display === 'none') {
                    explanationDiv.style.display = 'block';
                    this.textContent = '解説を非表示';
                } else {
                    explanationDiv.style.display = 'none';
                    this.textContent = '解説を表示';
                }
            });
            
            document.getElementById('prev-question').addEventListener('click', function() {
                if (currentQuestionIndex > 0 && !this.disabled) {
                    currentQuestionIndex--;
                    updateStudyScreen();
                }
            });
            
            document.getElementById('next-question').addEventListener('click', function() {
                if (currentQuestionIndex < filteredQuestions.length - 1 && !this.disabled) {
                    currentQuestionIndex++;
                    updateStudyScreen();
                }
            });
            
            // ラジオボタンの変更イベント
            document.querySelectorAll('input[name="status"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    if (this.checked) {
                        const currentQ = filteredQuestions[currentQuestionIndex];
                        const originalIndex = currentQuestions.findIndex(q => q.number === currentQ.number);
                        updateQuestionStatus(originalIndex, parseInt(this.value));
                    }
                });
            });
            
            // 表示モード変更イベント（学習画面）
            document.querySelectorAll('input[name="study-view-mode"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    if (this.checked) {
                        filterAndDisplay(currentFilter, this.value);
                    }
                });
            });
            
            // 表示モード変更イベント（リスト画面）
            document.querySelectorAll('input[name="list-view-mode"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    if (this.checked) {
                        filterAndDisplay(currentFilter, this.value);
                    }
                });
            });
        });