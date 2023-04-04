class SessionManager {
    setUrl(url) {
        this.url = url;
        this.domain = this.url.host;
        return this;
    }
    setName(name) {
        this.name = name;
        return this;
    }
    setStorageObject(storageObject) {
        this.storageObject = storageObject;
        return this;
    }
    async initStorageObject() {
        const storageObj = await chrome.storage.local.get(this.domain);
        this.setStorageObject(storageObj[this.domain] ?? {});
    }
    async initUrl() {
        if (!this.url) {
            const tabs = await chrome.tabs.query({
                active: true,
                windowId: chrome.windows.WINDOW_ID_CURRENT,
            });
            let tab = tabs[0];
            if (tab) {
                this.setUrl(new URL(tab.url));
            } else {
                throw "no active tab";
            }
        }
    }
    async loadAll() {
        await this.initUrl();
        await this.initStorageObject();
        for (let name in this.storageObject) {
            appendLine(name, this.storageObject[name].highlight);
        }
    }
    setHighlight() {
        highlightLine(this.name);
        for (let name in this.storageObject) {
            this.storageObject[name].highlight = name === this.name;
            console.debug(`${name} ${this.storageObject[name].highlight}`);
        }
    }
    async getMathchedCookies() {
        return (await chrome.cookies.getAll({})).filter((cookie) => {
            if (cookie.domain.startsWith(".")) {
                return this.domain.endsWith(cookie.domain.substring(1));
            } else {
                return this.domain === cookie.domain;
            }
        });
    }
    /**
     * 保存当前页面的所有 cookie
     */
    async save() {
        if (!this.name) return;
        const reg = new RegExp("^[\u4e00-\u9fa5_a-zA-Z0-9]+$");
        if (!this.name.match(reg)) {
            alertError("非法名称!");
            return;
        }

        try {
            let cookiesObj = {
                list: [],
                highlight: true,
            };
            const cookies = await this.getMathchedCookies();

            console.log(`save ${cookies.length} cookies`);
            cookies.map((cookie) => {
                cookiesObj.list.push({
                    // url: cookie.origin,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    expirationDate: cookie.expirationDate,
                });
                console.debug(`save ${cookie.name} ${cookie.domain}`);
            });
            this.storageObject[this.name] = cookiesObj;
            await this.storage();
            $("#input").val("");
            removeLine(this.name);
            appendLine(this.name, true);
            this.setHighlight();
            alertSuccess("保存成功");
        } catch (error) {
            alertError("保存失败!");
            console.log(error);
        }
    }
    /**
     * 获取当前页面的所有cookie，保存到高亮的session中
     */
    async update() {
        await this.save();
        alertSuccess("更新成功!");
    }
    /**
     * 清除当前域名当前tab的所有 cookie
     * @param {boolean} alert
     */
    async clear(alert = true) {
        const cookies = await this.getMathchedCookies();
        console.log(`clear ${cookies.length} cookies`);
        for (const cookie of cookies) {
            await chrome.cookies.remove({
                url: this.url.origin,
                name: cookie.name,
            });
            console.debug(`remove ${cookie.name} ${cookie.domain}`);
        }
        if (alert) alertSuccess("清除成功!");
    }
    /**
     * 使用历史某一个状态
     */
    async use() {
        // 先清空原有的 cookie
        await this.clear(false);
        this.setHighlight();
        if (this.storageObject[this.name]) {
            for (const cookie of this.storageObject[this.name].list) {
                // 设置 storage 存储的 cookie 到当前 tab 的域名中
                let newCookie = {
                    url: this.url.origin,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    expirationDate: cookie.expirationDate,
                };
                if (!newCookie.expirationDate) {
                    newCookie.expirationDate =
                        new Date().getTime() / 1000 + 3600 * 24 * 365;
                }
                await chrome.cookies.set(newCookie);
                console.log(`use cookies ${cookie.name} ${cookie.domain}`);
            }
        }
        // 高亮属性改变了，需要重新保存
        await this.storage();
        alertSuccess("启用成功!");
    }
    /**
     * 移除session
     */
    async remove() {
        if (this.storageObject[this.name]) {
            delete this.storageObject[this.name];
            await this.storage();
            removeLine(this.name);
            alertSuccess("删除成功!");
        }
    }
    /**
     * 保存storageObject到storage
     */
    async storage() {
        if (Object.keys(this.storageObject).length) {
            const obj = {};
            obj[this.domain] = this.storageObject;
            await chrome.storage.local.set(obj);
        } else {
            await chrome.storage.local.remove(this.domain);
        }
    }
    async import() {
        try {
            const arrFileHandle = await window.showOpenFilePicker({
                types: [
                    {
                        accept: {
                            "application/json": [".json"],
                        },
                    },
                ],
            });
        } catch (error) {
            alertError("导入失败!");
            return;
        }

        for (const fileHandle of arrFileHandle) {
            const fileData = await fileHandle.getFile();
            const buffer = await fileData.arrayBuffer();
            const str = new TextDecoder().decode(buffer);
            const obj = JSON.parse(str);
            await chrome.storage.local.set(obj);
        }
        alertSuccess("导入成功!");
    }
    async export() {
        const element = document.createElement("a");
        element.setAttribute(
            "href",
            "data:text/plain;charset=utf-8," +
                encodeURIComponent(
                    JSON.stringify(await chrome.storage.local.get(null))
                )
        );
        element.setAttribute("download", "session.json");
        element.style.display = "none";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
$(function () {
    let sessionManager = new SessionManager();
    sessionManager.loadAll();
    ["remove", "save", "use", "update", "clear", "export", "import"].map(
        (className) => {
            $(document).on("click", "." + className, function () {
                if (className === "clear") {
                    sessionManager.clear();
                } else if (className === "export") {
                    sessionManager.export();
                } else if (className === "import") {
                    sessionManager.import();
                } else {
                    let name =
                        className === "save"
                            ? $(this).siblings("input").val()
                            : $(this).siblings("span").html();
                    if (!name) {
                        alertError("非法操作");
                    } else {
                        sessionManager.setName(name);
                        if (typeof sessionManager[className] === "function") {
                            sessionManager[className]();
                        }
                    }
                }
            });
        }
    );
});
/**
 * 添加一行
 * @param {string} name session名称
 * @param {boolean} highlight 是否高亮
 */
function appendLine(name, highlight = false) {
    let $list = $("#list");
    let dd =
        '<dd data-name="' +
        name +
        '">' +
        "<span>" +
        name +
        "</span>" +
        '<a class="use">use</a>' +
        '<a class="update">update</a>' +
        '<a class="remove">remove</a>' +
        "</dd>";
    $list.prepend(dd);
    if (highlight) {
        highlightLine(name);
    }
}
/**
 * 删除一行（html）
 * @param {string} name
 */
function removeLine(name) {
    $('dd[data-name="' + name + '"]').remove();
}
/**
 * 高亮某一行
 * @param {string} name
 */
function highlightLine(name) {
    $('dd[data-name="' + name + '"]').css("backgroundColor", "#bbffbb");
    $('dd[data-name!="' + name + '"]').css("backgroundColor", "transparent");
}
/**
 * 提示成功消息
 * @param {string} msg
 */
function alertSuccess(msg) {
    $(".alert").html(msg).css("opacity", 1).css("color", "green");
    setTimeout(function () {
        $(".alert").css("opacity", 0);
    }, 1000);
}
/**
 * 提示失败信息
 * @param {string} msg
 */
function alertError(msg) {
    $(".alert").html(msg).css("opacity", 1).css("color", "red");
    setTimeout(function () {
        $(".alert").css("opacity", 0);
    }, 1000);
}
