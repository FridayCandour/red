chrome.action.onClicked.addListener(e=>{e.id&&chrome.tabs.sendMessage(e.id,{action:"toggle_panel"})});
