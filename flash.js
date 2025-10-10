// flash.js

let questionSets = [];
let currentSet = null;
let currentQuestions = [];
let filteredQuestions = [];
let currentQuestionIndex = 0;
let memoryStatus = []; // 現在のセットの学習記録 (0:未分類, 1:むずい, 2:ほぼOK, 3:完璧)
let currentFilter = 'all'; // 現在アクティブなフィルター

// 初期化処理
async function init() {
    try {
        await loadQuestionSets(); // 問題セットと学習記録を読み込む
        renderMainScreen(); // メイン画面を表示
    } catch (error) {
        console.error('初期化エラー:', error);
        showError('問題・正解セットの一覧.csvファイルを読み込めませんでした。<br>ファイルが同じフォルダにあることを確認してください。');
    }
}

// エラーメッセージの表示
function showError(message) {
    document.getElementById('sets-container').innerHTML = 
        `<div class="error">${message}</div>`;
}

// 成功メッセージの表示
function showSuccess(message) {
    // 既存の成功メッセージを全て削除
    const existingMessages = document.querySelectorAll('.success');
    existingMessages.forEach(msg => msg.remove());
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.innerHTML = message;
    
    // sets-container の先頭にメッセージを追加
    const container = document.getElementById('sets-container');
    container.insertBefore(successDiv, container.firstChild);
    
    // 3秒後に自動でメッセージを消去
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// CSVファイルの読み込み
async function loadCSV(filename) {
    return new Promise((resolve, reject) => {
        Papa.parse(filename, {
            download: true, // リモートファイルとしてダウンロードして解析
            header: false, // ヘッダー行なし
            skipEmptyLines: true, // 空行をスキップ
            dynamicTyping: true, // 数値や真偽値を自動的に型変換
            delimitersToGuess: [',', '\t', '|', ';'], // 区切り文字を自動判別
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

// 学習記録のエクスポート機能
function exportLearningRecords() {
    try {
        const records = [];

        // ヘッダー行を追加
        records.push(['問題セットID', '学習記録データ', '表示モード']); // ヘッダーに表示モードを追加

        // 各問題セットの学習記録と表示モードを収集
        for (let set of questionSets) {
            const statusKey = `フラッシュカード${set.id}`;
            const status = localStorage.getItem(statusKey);
            const viewMode = localStorage.getItem(`viewMode_${set.id}`) || 'card'; // 表示モードも取得

            if (status) {
                // statusとviewModeをダブルクオートで囲んで1セルに収める
                records.push([set.id, `"${status}"`, `"${viewMode}"`]);
            }
        }

        if (records.length <= 1) { // ヘッダー行のみの場合
            alert('エクスポートする学習記録がありません。');
            return;
        }

        // CSVデータを作成
        const csvContent = records.map(row => row.join(',')).join('\n');

        // ダウンロード用のBlobを作成
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        // ダウンロードリンクを作成して実行
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);

        const now = new Date();
        const timestamp = now.getFullYear() + 
            String(now.getMonth() + 1).padStart(2, '0') + 
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') + 
            String(now.getMinutes()).padStart(2, '0');

        link.setAttribute('download', `学習記録_${timestamp}.csv`);
        link.style.visibility = 'hidden'; // 画面に表示せずダウンロード
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url); // 不要になったURLオブジェクトを解放

        showSuccess('学習記録をエクスポートしました。');
        // 問題セットを再読み込みして画面を更新 (不要な場合もあるが、念のため)
        // loadQuestionSets().then(() => {
        //     renderMainScreen();
        // });
    } catch (error) {
        console.error('エクスポートエラー:', error);
        alert(`エクスポート中にエラーが発生しました: ${error.message}`);
    }
}

// 学習記録のインポート機能
function importLearningRecords(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            Papa.parse(e.target.result, {
                header: false,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.errors.length > 0) {
                        throw new Error(`CSVパースエラー: ${results.errors[0].message}`);
                    }
                    
                    const data = results.data;
                    let importCount = 0;
                    
                    // ヘッダー行をスキップ
                    for (let i = 1; i < data.length; i++) {
                        const row = data[i];
                        if (row.length >= 2) { // 少なくともIDと記録データがあることを確認
                            const setId = row[0];
                            const recordData = row[1];
                            const viewModeData = row.length >= 3 ? row[2] : 'card'; // 表示モードも取得、なければデフォルト'card'
                            
                            // 問題セットIDが有効かチェック
                            const targetSet = questionSets.find(set => set.id == setId);
                            if (targetSet) {
                                const statusKey = `フラッシュカード${setId}`;
                                localStorage.setItem(statusKey, recordData);
                                localStorage.setItem(`viewMode_${setId}`, viewModeData); // 表示モードも保存
                                importCount++;
                            }
                        }
                    }
                    
                    if (importCount > 0) {
                        // 問題セットを再読み込みして画面を更新
                        loadQuestionSets().then(() => {
                            renderMainScreen();
                            showSuccess(`${importCount}件の学習記録をインポートしました。`);
                        });
                    } else {
                        alert('インポートできる学習記録がありませんでした。');
                    }
                },
                error: function(error) {
                    throw new Error(`ファイル読み込みエラー: ${error.message}`);
                }
            });
        } catch (error) {
            console.error('インポートエラー:', error);
            alert(`インポート中にエラーが発生しました: ${error.message}`);
        }
    };
    
    reader.readAsText(file);
}

// 問題セット一覧の読み込みと初期化
async function loadQuestionSets() {
    const csvData = await loadCSV('問題・正解セットの一覧.csv');
    
    questionSets = [];
    for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        if (row.length >= 4) { // ID, タイトル, ファイル名, 問題数の4列があることを期待
            const set = {
                id: parseInt(row[0]) || (i + 1), // ID (数値に変換、失敗したら行番号+1)
                title: (row[1] || '').toString().trim(), // タイトル
                filename: (row[2] || '').toString().trim(), // 問題ファイル名
                questionCount: parseInt(row[3]) || 0, // 問題数
                currentViewMode: 'card' // 初期デフォルトはカード型
            };
            
            // タイトル、ファイル名、問題数が有効な場合にのみ追加
            if (set.title && set.filename && set.questionCount > 0) {
                questionSets.push(set);
            }
        }
    }

    if (questionSets.length === 0) {
        throw new Error('有効な問題セットが見つかりませんでした。');
    }

    // 各セットの暗記状況と表示モードを初期化/復元
    for (let set of questionSets) {
        const statusKey = `フラッシュカード${set.id}`;
        let status = localStorage.getItem(statusKey);
        
        if (!status) {
            // 学習記録がなければ全て未分類(0)で初期化
            status = Array(set.questionCount).fill(0).join(',');
            localStorage.setItem(statusKey, status);
        }
        
        set.memoryStatus = status.split(',').map(Number);
        
        // データの整合性チェック (問題数が変わった場合など)
        if (set.memoryStatus.length !== set.questionCount) {
            // 問題数に合わせてリサイズし、不足分は未分類で埋める
            const newMemoryStatus = Array(set.questionCount).fill(0);
            for (let i = 0; i < Math.min(set.memoryStatus.length, set.questionCount); i++) {
                newMemoryStatus[i] = set.memoryStatus[i];
            }
            set.memoryStatus = newMemoryStatus;
            localStorage.setItem(statusKey, set.memoryStatus.join(','));
        }
        
        // ローカルストレージから保存された表示モードを読み込む
        const savedViewMode = localStorage.getItem(`viewMode_${set.id}`);
        if (savedViewMode === 'card' || savedViewMode === 'list') {
            set.currentViewMode = savedViewMode;
        } else {
            set.currentViewMode = 'card'; // 無効な値や未保存の場合はデフォルトのカード型
        }

        // 統計を計算
        const counts = [0, 0, 0, 0]; // 0:未分類, 1:むずい, 2:ほぼOK, 3:完璧
        set.memoryStatus.forEach(s => {
            const status = parseInt(s);
            if (status >= 0 && status <= 3) { // 0～3の範囲外のデータは無視
                counts[status]++;
            } else {
                counts[0]++; // 不正なデータは未分類としてカウント
            }
        });
        set.untouchedCount = counts[0];
        set.notMemorizedCount = counts[1];
        set.maaOkCount = counts[2];
        set.rakushoCount = counts[3];
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
            <div class="set-header">
                ${set.id}.『 ${set.title}』コース
                <button class="secondary-btn" style="margin-left: 10px; padding: 4px 8px; font-size: 12px;" onclick="resetSetStatus(${set.id})">リセット</button>
            </div>                    
            <div class="status">
                <button class="untouched-btn" onclick="startStudyWithFilter(${set.id}, 0)">未分類: ${set.untouchedCount}</button>
                <button class="not-memorized-btn" onclick="startStudyWithFilter(${set.id}, 1)">むずい: ${set.notMemorizedCount}</button>
                <button class="maa-ok-btn" onclick="startStudyWithFilter(${set.id}, 2)">ほぼOK: ${set.maaOkCount}</button>
                <button class="rakusho-btn" onclick="startStudyWithFilter(${set.id}, 3)">完璧: ${set.rakushoCount}</button>                        
                表示方式
                <div class="view-mode-selector">
                    <input type="radio" id="main-card-mode-${set.id}" name="main-view-mode-${set.id}" value="card" onchange="updateMainViewMode(${set.id}, this.value)">
                    <label for="main-card-mode-${set.id}">カード型</label>
                    <input type="radio" id="main-list-mode-${set.id}" name="main-view-mode-${set.id}" value="list" onchange="updateMainViewMode(${set.id}, this.value)">
                    <label for="main-list-mode-${set.id}">一覧型</label>
                </div>
            </div>
        `;
        
        container.appendChild(setDiv);

        // 各セットに保存されている表示モードをラジオボタンに反映
        const cardRadio = document.getElementById(`main-card-mode-${set.id}`);
        const listRadio = document.getElementById(`main-list-mode-${set.id}`);
        if (set.currentViewMode === 'card') {
            cardRadio.checked = true;
        } else {
            listRadio.checked = true;
        }
    });

    // 学習記録操作ボタンを表示
    document.getElementById('record-controls').style.display = 'flex';
}

// コースのステータスをリセット
function resetSetStatus(setId) {
    if (!confirm(setId + `番のコースのすべての問題を未分類に戻しますか?`)) {
        return;
    }
    
    const set = questionSets.find(s => s.id === setId);
    if (!set) return;
    
    // すべて未分類(0)にリセット
    const resetStatus = Array(set.questionCount).fill(0).join(',');
    const statusKey = `フラッシュカード${setId}`;
    localStorage.setItem(statusKey, resetStatus);
    
    // 問題セットを再読み込みして画面を更新
    loadQuestionSets().then(() => {
        renderMainScreen();
        showSuccess(`『${set.title}』コースをリセットしました。`);
    });
}

// メイン画面でのビューモード更新 (localStorage に保存)
function updateMainViewMode(setId, viewMode) {
    const set = questionSets.find(s => s.id === setId);
    if (set) {
        set.currentViewMode = viewMode; // セットの表示モードを更新
        localStorage.setItem(`viewMode_${setId}`, viewMode); // ローカルストレージに保存
    }
}

// 問題セットの読み込み (問題データ自体)
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
            if (row.length >= 3) { // 質問, 回答, 解説の3列があることを期待
                questions.push({
                    number: parseInt(row[0]) || (i + 1), // 問題番号 (数値に変換、失敗したら行番号+1)
                    question: (row[1] || '').toString().trim(), // 質問テキスト
                    answer: (row[2] || '').toString().trim(), // 回答テキスト
                    explanation: row.length >= 4 ? (row[3] || '').toString().trim() : '' // 解説 (オプション)
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
async function startStudyWithFilter(setId, filter) { // viewMode 引数を削除
    try {
        currentSet = questionSets.find(set => set.id === setId);

        currentQuestions = await loadQuestionSet(setId); // 問題データを読み込む
        
        // ローカルストレージから最新の学習記録を読み込む
        const statusKey = `フラッシュカード${setId}`;
        const savedStatus = localStorage.getItem(statusKey);
        if (savedStatus) {
            memoryStatus = savedStatus.split(',').map(Number);
            currentSet.memoryStatus = [...memoryStatus]; // currentSetのメモリステータスも更新
        } else {
            // ここに到達することは基本的にない (loadQuestionSetsで初期化済みのため)
            memoryStatus = Array(currentSet.questionCount).fill(0);
            localStorage.setItem(statusKey, memoryStatus.join(','));
            currentSet.memoryStatus = [...memoryStatus];
        }

        currentFilter = filter; // 現在のフィルター状態を保存
        
        // フィルター条件に基づいて問題を絞り込む
        filteredQuestions = currentQuestions.filter((q, index) => {
            switch (filter) {
                case 'all': return true; // 全て表示 (現在未使用)
                case 0: return memoryStatus[index] === 0; // 未分類
                case 1: return memoryStatus[index] === 1; // むずい
                case 2: return memoryStatus[index] === 2; // ほぼOK
                case 3: return memoryStatus[index] === 3; // 完璧
                default: return true; // デフォルトでは全て表示
            }
        });
        
        if (filteredQuestions.length === 0) {
            //alert('対象となる問題がありません。');
            return; // 絞り込み結果が空なら何もしない
        }
        
        // メイン画面の学習記録操作ボタンを非表示にする
        document.getElementById('record-controls').style.display = 'none';
        
        // currentSetに保存されている表示モードに基づいて画面を切り替える
        if (currentSet.currentViewMode === 'card') {
            startCardMode();
        } else {
            startListMode();
        }
        
    } catch (error) {
        console.error('学習開始エラー:', error);
        alert(`エラーが発生しました: ${error.message}`);
    }
}

// カードモードで学習画面を開始
function startCardMode() {
    currentQuestionIndex = 0; // 最初の問題から開始
    
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('list-screen').style.display = 'none';
    document.getElementById('study-screen').style.display = 'block'; // 学習画面を表示
    
    // UI要素の更新
    document.getElementById('study-title').textContent = currentSet.title;
    
    // 学習画面の表示方式ラジオボタンを「カード型」に設定
    document.getElementById('study-card-mode').checked = true;
    document.getElementById('study-list-mode').checked = false;
    
    updateStudyScreen(); // 問題カードの内容を更新
    updateStatusCounts(); // 統計情報を更新
    updateActiveFilterButton(); // アクティブなフィルターボタンを強調
}

// リストモードで学習画面を開始
function startListMode() {
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('study-screen').style.display = 'none';
    document.getElementById('list-screen').style.display = 'block'; // 一覧画面を表示
    
    document.getElementById('list-title').textContent = currentSet.title;
    
    // 一覧画面の表示方式ラジオボタンを「一覧型」に設定
    document.getElementById('list-card-mode').checked = false;
    document.getElementById('list-list-mode').checked = true;
    
    updateStatusCounts(); // 統計情報を更新
    renderQuestionList(); // 問題リストをレンダリング
    updateActiveFilterButton(); // アクティブなフィルターボタンを強調
}

// 指定されたフィルターと表示モードに基づいて問題を絞り込み、画面を更新
function filterAndDisplay(filter, viewMode) {
    currentFilter = filter; // 現在のフィルター状態を更新

    // フィルター条件に一致する問題だけを抽出
    filteredQuestions = currentQuestions.filter((q, index) => {
        switch (filter) {
            case 'all': return true;
            case 0: return memoryStatus[index] === 0; // 未分類
            case 1: return memoryStatus[index] === 1; // むずい
            case 2: return memoryStatus[index] === 2; // ほぼOK
            case 3: return memoryStatus[index] === 3; // 完璧
            default: return true;
        }
    });

    if (filteredQuestions.length === 0) {
        //alert('対象となる問題がありません。');
        return; // 表示すべき問題がなければ処理中断
    }

    // currentSetに表示モードを保存し、ローカルストレージにも保存
    if (currentSet) {
        currentSet.currentViewMode = viewMode;
        localStorage.setItem(`viewMode_${currentSet.id}`, viewMode);
    }

    if (viewMode === 'card') {
        currentQuestionIndex = 0; // 最初の問題から表示開始
        document.getElementById('list-screen').style.display = 'none';
        document.getElementById('study-screen').style.display = 'block';
        // 学習画面のラジオボタンを「カード型」に設定
        document.getElementById('study-card-mode').checked = true;
        document.getElementById('study-list-mode').checked = false;
        updateStudyScreen(); // 学習画面の内容を更新
    } else { // 'list'モードの場合
        document.getElementById('study-screen').style.display = 'none';
        document.getElementById('list-screen').style.display = 'block';
        // リスト画面のラジオボタンを「一覧型」に設定
        document.getElementById('list-card-mode').checked = false;
        document.getElementById('list-list-mode').checked = true;
        renderQuestionList(); // 問題リストを描画
    }

    updateStatusCounts(); // 統計情報を更新
    updateActiveFilterButton(); // アクティブなフィルターボタンを強調
}

// 現在の表示モード（カード型 or 一覧型）を取得
function getViewMode() {
    if (document.getElementById('study-screen').style.display === 'block') {
        return document.querySelector('input[name="study-view-mode"]:checked').value;
    } else if (document.getElementById('list-screen').style.display === 'block') {
        return document.querySelector('input[name="list-view-mode"]:checked').value;
    }
    return currentSet ? currentSet.currentViewMode : 'card'; // どちらも表示されていない場合はcurrentSetのモードを返す
}


// 学習画面（カードモード）の更新
function updateStudyScreen() {
    if (filteredQuestions.length === 0) return;
    
    const currentQ = filteredQuestions[currentQuestionIndex];
    // 元の質問配列でのインデックスを見つける (学習記録の参照用)
    const originalIndex = currentQuestions.findIndex(q => q.number === currentQ.number);
    
    document.getElementById('study-title').textContent = currentSet.title;
    
    // 問題表示
    document.getElementById('current-question').innerHTML = currentQ.number; // 問題番号
    document.getElementById('question-text').innerHTML = currentQ.question; // 質問テキスト
    document.getElementById('answer-text').innerHTML = currentQ.answer; // 回答テキスト
    document.getElementById('explanation-text').innerHTML = currentQ.explanation; // 解説テキスト
    
    // 画面表示のリセット
    document.getElementById('answer-text').style.display = 'none';
    document.getElementById('explanation-text').style.display = 'none';
    document.getElementById('toggle-answer').textContent = '正解を見てから分類';
    document.getElementById('toggle-explanation').style.display = 'none';
    document.getElementById('toggle-explanation').textContent = '解説を表示';
    
    // ラジオボタンの設定 (現在の問題の学習記録に基づいて選択)
    const status = memoryStatus[originalIndex];
    document.querySelectorAll('input[name="status"]').forEach(radio => {
        radio.checked = (radio.value == status); // valueがstatusと一致するものをチェック
    });
    
    // ナビゲーションボタンの活性/非活性制御
    const prevBtn = document.getElementById('prev-question');
    const nextBtn = document.getElementById('next-question');
    
    prevBtn.disabled = (currentQuestionIndex <= 0); // 最初の問題なら「前へ」を非活性
    nextBtn.disabled = (currentQuestionIndex >= filteredQuestions.length - 1); // 最後の問題なら「次へ」を非活性
        
    updateStatusCounts(); // 統計情報を更新
}

// 統計情報の更新 (学習画面と一覧画面の両方)
function updateStatusCounts() {
    const counts = [0, 0, 0, 0]; // 0:未分類, 1:むずい, 2:ほぼOK, 3:完璧
    memoryStatus.forEach(s => counts[s]++);
    
    // 学習画面用カウントの更新
    document.getElementById('untouched-count').textContent = counts[0];
    document.getElementById('not-memorized-count').textContent = counts[1];
    document.getElementById('maa-ok-count').textContent = counts[2];
    document.getElementById('rakusho-count').textContent = counts[3];
    
    // リスト画面用カウントの更新
    document.getElementById('list-untouched-count').textContent = counts[0];
    document.getElementById('list-not-memorized-count').textContent = counts[1];
    document.getElementById('list-maa-ok-count').textContent = counts[2];
    document.getElementById('list-rakusho-count').textContent = counts[3];
}

// アクティブなフィルターボタンのスタイル更新
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
        case 0: targetClass = 'untouched-btn'; break;
        case 1: targetClass = 'not-memorized-btn'; break;
        case 2: targetClass = 'maa-ok-btn'; break;
        case 3: targetClass = 'rakusho-btn'; break;
        case 'all': targetClass = 'total-btn'; break; // 'all'フィルターがある場合
    }

    // 現在表示中の画面のボタンにactiveクラスを追加
    if (isStudyScreen) {
        document.querySelectorAll(`#study-status .${targetClass}`).forEach(btn => btn.classList.add('active'));
    } else if (isListScreen) {
        document.querySelectorAll(`#list-status .${targetClass}`).forEach(btn => btn.classList.add('active'));
    }
}

// 問題一覧のレンダリング (リストモード用)
function renderQuestionList() {
    const listContainer = document.getElementById('questions-list');
    listContainer.innerHTML = ''; // コンテナをクリア
    document.getElementById('list-title').textContent = currentSet.title;

    // let i = 0; // カウンターが不要であれば削除
    filteredQuestions.forEach((question) => {
        // 元の質問配列でのインデックスを見つける (学習記録の参照用)
        const originalIndex = currentQuestions.findIndex(q => q.number === question.number);
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-list-item';
        // i++; // カウンターが不要であれば削除

        questionDiv.innerHTML = `
            <div class="question-content">
                <strong>${question.number}:</strong> ${question.question}
                <div class="navigation">
                    <div class="radio-group">
                        <div class="radio-item">
                            <input type="radio" id="list-untouched-${question.number}" name="list-status-${question.number}" value="0" ${memoryStatus[originalIndex] === 0 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 0)">
                            <label for="list-untouched-${question.number}"><span class="label-untouched">未分類</span></label>
                        </div>
                        <div class="radio-item">
                            <input type="radio" id="list-not-memorized-${question.number}" name="list-status-${question.number}" value="1" ${memoryStatus[originalIndex] === 1 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 1)">
                            <label for="list-not-memorized-${question.number}"><span class="label-not-memorized">むずい</span></label>
                        </div>
                        <div class="radio-item">
                            <input type="radio" id="list-maa-ok-${question.number}" name="list-status-${question.number}" value="2" ${memoryStatus[originalIndex] === 2 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 2)">
                            <label for="list-maa-ok-${question.number}"><span class="label-maa-ok">ほぼOK</span></label>
                        </div>
                        <div class="radio-item">
                            <input type="radio" id="list-rakusho-${question.number}" name="list-status-${question.number}" value="3" ${memoryStatus[originalIndex] === 3 ? 'checked' : ''} onchange="updateQuestionStatus(${originalIndex}, 3)">
                            <label for="list-rakusho-${question.number}"><span class="label-rakusho">完璧</span></label>
                        </div>
                    </div>
                </div>
                <!-- ボタンをラジオボタンの下の行に分離 -->
                <div class="button-group" style="margin-top: 10px;">
                    <button class="success-btn" onclick="toggleQuestionAnswer(${question.number}, this)">正解を見てから分類</button>
                    <button class="warning-btn" id="explanation-btn-${question.number}" onclick="toggleQuestionExplanation(${question.number}, this)" style="display: none;">解説表示</button>
                </div>
                <div id="answer-${question.number}" class="answer-text" style="display: none;">${question.answer}</div>
                <div id="explanation-${question.number}" class="explanation-text" style="display: none;">${question.explanation}</div>
            </div>
        `;
        
        listContainer.appendChild(questionDiv);
    });
}

// 問題の暗記状態を更新
function updateQuestionStatus(originalIndex, status) {
    // const oldStatus = memoryStatus[originalIndex]; // 旧ステータスは現在未使用
    memoryStatus[originalIndex] = status; // 新しいステータスに更新
    
    // ローカルストレージに学習記録を保存
    const statusKey = `フラッシュカード${currentSet.id}`;
    localStorage.setItem(statusKey, memoryStatus.join(','));
    
    // 統計情報を更新
    updateStatusCounts();
    
    // currentSet の統計情報を直接更新 (メイン画面に戻ったときに正しく表示されるように)
    const counts = [0, 0, 0, 0];
    memoryStatus.forEach(s => counts[s]++);
    currentSet.untouchedCount = counts[0];
    currentSet.notMemorizedCount = counts[1];
    currentSet.maaOkCount = counts[2];
    currentSet.rakushoCount = counts[3];            

    // フィルタリングされた問題リストを更新し、現在の画面を再描画
    const currentViewMode = getViewMode();
    const currentQ = filteredQuestions[currentQuestionIndex]; // 現在表示中の問題
    
    // 新しいフィルタリングリストを作成
    const newFilteredQuestions = currentQuestions.filter((q, index) => {
        switch (currentFilter) {
            case 'all': return true;
            case 0: return memoryStatus[index] === 0;
            case 1: return memoryStatus[index] === 1;
            case 2: return memoryStatus[index] === 2;
            case 3: return memoryStatus[index] === 3;
            default: return true;
        }
    });
    
    // 現在の問題が新しいフィルターリストにまだ存在するかチェック
    const stillInFilter = newFilteredQuestions.some(q => q.number === currentQ.number);
    
    filteredQuestions = newFilteredQuestions; // フィルター済みリストを更新
    
    if (currentViewMode === 'card') {
        // カード型の場合
        if (filteredQuestions.length === 0) {
            // フィルター対象が空になった場合
            const counts = [0, 0, 0, 0];
            memoryStatus.forEach(s => counts[s]++);
            
            let newFilter = null; // 次に表示すべきフィルターを探す
            if (counts[0] > 0) newFilter = 0;
            else if (counts[1] > 0) newFilter = 1;
            else if (counts[2] > 0) newFilter = 2;
            else if (counts[3] > 0) newFilter = 3;

            if (newFilter !== null) {
                // 新しいフィルターで表示
                if (currentSet) {
                    currentSet.currentViewMode = 'card'; // モードをカード型に設定
                    localStorage.setItem(`viewMode_${currentSet.id}`, 'card');
                }
                filterAndDisplay(newFilter, 'card');
            } else {
                // すべての問題が分類された場合
                alert('すべての問題を分類しました。');
                document.getElementById('study-screen').style.display = 'none';
                document.getElementById('main-screen').style.display = 'block';
                loadQuestionSets().then(() => { // メイン画面の統計情報を最新に
                    renderMainScreen();
                });
            }
        } else if (!stillInFilter) {
            // 現在の問題がフィルタから外れた場合
            if (currentQuestionIndex >= filteredQuestions.length) {
                // 最後の問題だった場合、1つ前を表示
                currentQuestionIndex = filteredQuestions.length - 1;
            }
            updateStudyScreen(); // 次の問題を表示
        } else {
            // 現在の問題がまだフィルタ内にある場合
            const newIndex = filteredQuestions.findIndex(q => q.number === currentQ.number);
            currentQuestionIndex = newIndex; // インデックスを更新
            updateStudyScreen(); // 現在の問題を再表示（ステータス反映のため）
        }
    } else { // リスト型の場合
        if (filteredQuestions.length === 0) {
            // フィルター対象が空になった場合
            const counts = [0, 0, 0, 0];
            memoryStatus.forEach(s => counts[s]++);
            
            let newFilter = null;
            if (counts[0] > 0) newFilter = 0;
            else if (counts[1] > 0) newFilter = 1;
            else if (counts[2] > 0) newFilter = 2;
            else if (counts[3] > 0) newFilter = 3;
            
            if (newFilter !== null) {
                // 新しいフィルターで表示
                if (currentSet) {
                    currentSet.currentViewMode = 'list'; // モードをリスト型に設定
                    localStorage.setItem(`viewMode_${currentSet.id}`, 'list');
                }
                filterAndDisplay(newFilter, 'list');
            } else {
                // すべての問題が分類された場合
                alert('すべての問題を分類しました。');
                document.getElementById('list-screen').style.display = 'none';
                document.getElementById('main-screen').style.display = 'block';
                loadQuestionSets().then(() => { // メイン画面の統計情報を最新に
                    renderMainScreen();
                });
            }
        } else {
            // リストを再描画してステータスを反映
            renderQuestionList();
        }
    }
}

// 問題一覧での正解表示切り替え (リストモード用)
function toggleQuestionAnswer(questionNumber, button) { // button引数を追加
    const answerDiv = document.getElementById(`answer-${questionNumber}`);
    const explanationBtn = document.getElementById(`explanation-btn-${questionNumber}`);
    
    if (answerDiv.style.display === 'none') {
        answerDiv.style.display = 'block';
        button.textContent = '正解を隠す';
        // 解説がある場合のみ解説ボタンを表示
        const question = currentQuestions.find(q => q.number === questionNumber);
        if (question && question.explanation && question.explanation.trim() !== '') { // 空文字列でないかも確認
            explanationBtn.style.display = 'inline-block';
        }
    } else {
        answerDiv.style.display = 'none';
        button.textContent = '正解を見てから分類';
        // 解説ボタンを非表示
        explanationBtn.style.display = 'none';
        // 解説も非表示
        const explanationDiv = document.getElementById(`explanation-${questionNumber}`);
        explanationDiv.style.display = 'none';
        explanationBtn.textContent = '解説表示';
    }
}

// 問題一覧での解説表示切り替え (リストモード用)
function toggleQuestionExplanation(questionNumber, button) { // button引数を追加
    const explanationDiv = document.getElementById(`explanation-${questionNumber}`);
    
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
    init(); // アプリケーションの初期化
    
    // 学習記録エクスポートボタンのクリックイベント
    document.getElementById('export-record').addEventListener('click', function() {
        exportLearningRecords();
    });
    
    // 学習記録インポートボタンのクリックイベント
    document.getElementById('import-record').addEventListener('click', function() {
        document.getElementById('import-file').click(); // 隠しファイル入力要素をクリック
    });
    
    // インポートファイルが選択されたときのイベント
    document.getElementById('import-file').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            importLearningRecords(e.target.files[0]); // ファイルを読み込んでインポート処理を実行
            e.target.value = ''; // ファイル選択をリセットして、同じファイルを再度選択できるようにする
        }
    });
    
    // 学習画面からメインメニューに戻るボタンのクリックイベント
    document.getElementById('back-to-main').addEventListener('click', function() {
        if (currentSet) { 
            // 現在の表示モードを保存 (学習画面のラジオボタンの状態から取得)
            currentSet.currentViewMode = document.querySelector('input[name="study-view-mode"]:checked').value;
            localStorage.setItem(`viewMode_${currentSet.id}`, currentSet.currentViewMode);
        }
        document.getElementById('study-screen').style.display = 'none'; // 学習画面を非表示
        document.getElementById('list-screen').style.display = 'none'; // 一覧画面も非表示
        document.getElementById('main-screen').style.display = 'block'; // メイン画面を表示
        loadQuestionSets().then(() => { // 最新の学習記録を読み込み直して
            renderMainScreen(); // メイン画面を再描画 (各セットのラジオボタン状態を更新するため)
        });
    });
    
    // 一覧画面からメインメニューに戻るボタンのクリックイベント
    document.getElementById('back-to-main-from-list').addEventListener('click', function() {
        if (currentSet) { 
            // 現在の表示モードを保存 (一覧画面のラジオボタンの状態から取得)
            currentSet.currentViewMode = document.querySelector('input[name="list-view-mode"]:checked').value;
            localStorage.setItem(`viewMode_${currentSet.id}`, currentSet.currentViewMode);
        }
        document.getElementById('study-screen').style.display = 'none'; // 学習画面を非表示
        document.getElementById('list-screen').style.display = 'none'; // 一覧画面を非表示
        document.getElementById('main-screen').style.display = 'block'; // メイン画面を表示
        loadQuestionSets().then(() => { // 最新の学習記録を読み込み直して
            renderMainScreen(); // メイン画面を再描画
        });
    });

    // 学習画面の「正解を見てから分類」ボタンのクリックイベント
    document.getElementById('toggle-answer').addEventListener('click', function() {
        const answerDiv = document.getElementById('answer-text');
        const explanationBtn = document.getElementById('toggle-explanation');
        if (answerDiv.style.display === 'none') {
            answerDiv.style.display = 'block'; // 正解を表示
            this.textContent = '正解を隠す';
            // 解説がある場合のみ解説ボタンを表示
            const currentQ = filteredQuestions[currentQuestionIndex];
            if (currentQ && currentQ.explanation && currentQ.explanation.trim() !== '') { // 空文字列でないかも確認
                explanationBtn.style.display = 'inline-block';
            }
        } else {
            answerDiv.style.display = 'none'; // 正解を隠す
            this.textContent = '正解を見てから分類';
            // 解説ボタンを非表示
            explanationBtn.style.display = 'none';
            // 解説も隠す
            const explanationDiv = document.getElementById('explanation-text');
            explanationDiv.style.display = 'none';
            explanationBtn.textContent = '解説を表示';
        }
    });
    
    // 学習画面の「解説を表示」ボタンのクリックイベント
    document.getElementById('toggle-explanation').addEventListener('click', function() {
        const explanationDiv = document.getElementById('explanation-text');
        if (explanationDiv.style.display === 'none') {
            explanationDiv.style.display = 'block'; // 解説を表示
            this.textContent = '解説を非表示';
        } else {
            explanationDiv.style.display = 'none'; // 解説を隠す
            this.textContent = '解説を表示';
        }
    });
    
    // 学習画面の「前へ」ボタンのクリックイベント
    document.getElementById('prev-question').addEventListener('click', function() {
        if (currentQuestionIndex > 0 && !this.disabled) {
            currentQuestionIndex--; // インデックスを減らす
            updateStudyScreen(); // 画面を更新
        }
    });
    
    // 学習画面の「次へ」ボタンのクリックイベント
    document.getElementById('next-question').addEventListener('click', function() {
        if (currentQuestionIndex < filteredQuestions.length - 1 && !this.disabled) {
            currentQuestionIndex++; // インデックスを増やす
            updateStudyScreen(); // 画面を更新
        }
    });
    
    // 学習画面の分類ラジオボタンの変更イベント (未分類、むずい、ほぼOK、完璧)
    document.querySelectorAll('input[name="status"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                const currentQ = filteredQuestions[currentQuestionIndex];
                const originalIndex = currentQuestions.findIndex(q => q.number === currentQ.number);
                updateQuestionStatus(originalIndex, parseInt(this.value)); // 学習記録を更新
            }
        });
    });
    
    // 学習画面の表示モード変更イベント (カード型 / 一覧型)
    document.querySelectorAll('input[name="study-view-mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                filterAndDisplay(currentFilter, this.value); // 表示モードを切り替えて画面を更新
            }
        });
    });
    
    // リスト画面の表示モード変更イベント (カード型 / 一覧型)
    document.querySelectorAll('input[name="list-view-mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                filterAndDisplay(currentFilter, this.value); // 表示モードを切り替えて画面を更新
            }
        });
    });
});                