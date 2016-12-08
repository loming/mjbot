const Telegraf = require('telegraf')


//DEBUGGING
const DEBUG = true
const DPRINT = function(ctx, msg) {
    if (DEBUG) {
        ctx.reply('DEBUG: ' + msg)
    }
}


//CONST STRINGS
const str_playing = '咪開咗局打緊牌囉，做咩姐你？'
const str_q_howbig = '今晚打幾大？'
const str_start_8_64 = '八番 64'
const str_start_8_128 = '八番 128'
const str_start_10_128 = '十番 128'
const str_start_10_256 = '十番 256'
const str_start_endgame = '都係唔打啦'
const str_started = '打咁九細㗎'
const str_start_failed = '收九皮啦你!'
const str_notstarted = '都未撚開始打就話打完傻撚咗呀？'
const str_finished = '打多四圈啦咁快走，唉早唞啦。'
const str_whoplay = '請問四位勇士係？'

const str_state = '狀態'
const str_status_notstart = '未有牌局喎'
const str_status_start = '開緊局'
const str_status_unknown = '我都唔九知係到做緊乜嘢'


//Price Table
const pricelist = {
    d864: [
        {fan: 8, value:64},
        {fan: 7, value:48},
        {fan: 6, value:32},
        {fan: 5, value:24},
        {fan: 4, value:16},
        {fan: 3, value:8},
    ],
    d8128: [
        {fan: 8, value:128},
        {fan: 7, value:96},
        {fan: 6, value:64},
        {fan: 5, value:48},
        {fan: 4, value:32},
        {fan: 3, value:16},
    ],
    d10128: [
        {fan: 10, value:128},
        {fan: 9, value:96},
        {fan: 8, value:64},
        {fan: 7, value:48},
        {fan: 6, value:32},
        {fan: 5, value:24},
        {fan: 4, value:16},
        {fan: 3, value:8},
    ],
    d10256: [
        {fan: 10, value:256},
        {fan: 9, value:192},
        {fan: 8, value:128},
        {fan: 7, value:96},
        {fan: 6, value:64},
        {fan: 5, value:48},
        {fan: 4, value:32},
        {fan: 3, value:16},
    ]
}

//Telegraf Flow for Scene Controls
const TelegrafFlow = require('telegraf-flow')
const { Scene } = TelegrafFlow

const flow = new TelegrafFlow()

//Redis middleware to save sessions into redis
const RedisSession = require('telegraf-session-redis')

const session = new RedisSession({
    store: {
        host: process.env.TELEGRAM_SESSION_HOST || '127.0.0.1',
        port: process.env.TELEGRAM_SESSION_PORT || 6379
    }
})


//Telegram referneces
const { Router, Extra, Markup } = require('telegraf')
const bot = new Telegraf(process.env.BOT_TOKEN, {username: 'mj_god_bot'})


// Start Scene
const startScene = new Scene('start')

startScene.enter((ctx) => {

    resetGame(ctx)

    return ctx.reply(str_q_howbig,
        Markup.inlineKeyboard([
            [ Markup.callbackButton(str_start_8_64, str_start_8_64), Markup.callbackButton(str_start_8_128, str_start_8_128) ],
            [ Markup.callbackButton(str_start_10_128, str_start_10_128), Markup.callbackButton(str_start_10_256, str_start_10_256) ],
            [ Markup.callbackButton(str_start_endgame, str_start_endgame) ]
        ])
            .oneTime()
            .resize()
            .extra()
    )
})

startScene.on('callback_query', (ctx) => {
    var replymsg = ctx.callbackQuery.data + '? ' + str_started
    DPRINT(ctx, 'ctx.callbackQuery.data: ' + ctx.callbackQuery.data)

    switch (ctx.callbackQuery.data) {
        case str_start_8_64:
            ctx.session.game.pricelist = pricelist['d864'].slice(0)
            break
        case str_start_8_128:
            ctx.session.game.pricelist = pricelist['d8128'].slice(0)
            break
        case str_start_10_128:
            ctx.session.game.pricelist = pricelist['d10128'].slice(0)
            break
        case str_start_10_256:
            ctx.session.game.pricelist = pricelist['d10256'].slice(0)
            break
        case str_start_endgame:
            ctx.session.game.pricelist = null
            return endGame(ctx)
        default:
            ctx.session.game.pricelist = null
            return ctx.reply('究竟想打乜撚嘢？')
    }

    showPriceList(ctx)
    ctx.flow.enter('prepare')

    return ctx.editMessageText(replymsg)
})


// Preparation Scene
const prepareScene = new Scene('prepare')

const prepareRouter = new Router((ctx) => {
    if (!ctx.callbackQuery.data) {
        return Promise.resolve()
    }

    if (ctx.callbackQuery.data.indexOf(':')) {
        const parts = ctx.callbackQuery.data.split(':')
        return Promise.resolve({
            route: parts[0],
            state: {
                value: parts[1]
            }
        })
    } else {
        return Promise.resolve()
    }
})

prepareRouter.on('select', (ctx) => {
    if (ctx.session.askingseat) {
        switch (ctx.session.askingseat) {
            case 'north':
                ctx.session.game.seat_north = ctx.state.value
                ctx.editMessageText('北位 - ' + ctx.state.value)
                break
            case 'west':
                ctx.session.game.seat_west = ctx.state.value
                ctx.editMessageText('西位 - ' + ctx.state.value)
                break
            case 'east':
                ctx.session.game.seat_east = ctx.state.value
                ctx.editMessageText('東位 - ' + ctx.state.value)
                break
            case 'south':
                ctx.session.game.seat_south = ctx.state.value
                ctx.editMessageText('南位 - ' + ctx.state.value)
                break
            default:
                break
        }
    }

    ctx.session.askingseat = null
    return askParticipant(ctx)
})

prepareScene.enter((ctx) => askParticipant(ctx))

prepareScene.on('callback_query', prepareRouter.middleware())

prepareScene.action('north', (ctx) => {
    ctx.session.askingseat = 'north'
    return ctx.editMessageText('邊個坐北位？', genMembers(ctx))
})
prepareScene.action('west', (ctx) => {
    ctx.session.askingseat = 'west'
    return ctx.editMessageText('邊個坐西位？', genMembers(ctx))
})
prepareScene.action('east', (ctx) => {
    ctx.session.askingseat = 'east'
    return ctx.editMessageText('邊個坐東位？', genMembers(ctx))
})
prepareScene.action('south', (ctx) => {
    ctx.session.askingseat = 'south'
    return ctx.editMessageText('邊個坐南位？', genMembers(ctx))
})
prepareScene.action('finish', (ctx) => {
    if (ctx.session.game.seat_north && ctx.session.game.seat_east && ctx.session.game.seat_west && ctx.session.game.seat_south) {
        var replymsg = ''
        if (ctx.session.game.start_time == null) {
            replymsg = '祝各位贏多D啦～ 開打！'
            //showPriceList(ctx)
            ctx.session.game.start_time = new Date().getTime()
        } else {
            replymsg = '更新咗'
        }

        ctx.editMessageText(replymsg)
        ctx.flow.enter('playing')
    } else {
        ctx.editMessageText('入埋D人名先啦邊個打呀家下？')
        return askParticipant(ctx)
    }
})


//Playing Scene
const playingScene = new Scene('playing')

const playingRouter = new Router((ctx) => {
    if (!ctx.callbackQuery.data) {
        return Promise.resolve()
    }
    const parts = ctx.callbackQuery.data.split(':')
    return Promise.resolve({
        route: parts[0],
        state: {
            value: parts[1]
        }
    })
})

playingScene.on('callback_query', playingRouter.middleware())

function eat_others_step1(ctx) {
    ctx.session.playingState = {}
    ctx.session.playingState.name = 'eat_others'
    ctx.session.playingState.steps = 1
    return ctx.reply('食幾大？', genEatHowBig(ctx))
}

function eat_others_step2(ctx) {
    ctx.session.playingState.steps = 2
    return ctx.reply('邊個食？', genPlayerSelection(ctx))
}

function eat_others_step3(ctx) {
    ctx.session.playingState.steps = 3
    return ctx.reply('邊個出沖？', genPlayerSelection(ctx))
}


function eat_self_step1(ctx) {
    ctx.session.playingState = {}
    ctx.session.playingState.name = 'eat_self'
    ctx.session.playingState.steps = 1
    return ctx.reply('食幾大？', genEatHowBig(ctx))
}

function eat_self_step2(ctx) {
    ctx.session.playingState.steps = 2
    return ctx.reply('邊個自摸？', genPlayerSelection(ctx))
}

function genEatHowBig(ctx) {
    var array_of_fan = []
    Object.keys(ctx.session.game.pricelist).forEach(function (key) {
        var val = ctx.session.game.pricelist[key];
        array_of_fan.push([Markup.callbackButton(val['fan'] + '番', 'eat:' + val['fan'])])
    })
    return Markup.inlineKeyboard(array_of_fan)
        .oneTime()
        .resize()
        .extra()
}

playingRouter.on('finish', (ctx) => {
    switch (ctx.state.value) {
        case 'eat_others':
            ctx.editMessageText('有人食糊呀.')
            return eat_others_step1(ctx)
        case 'eat_self':
            ctx.editMessageText('有人自摸!!')
            return eat_self_step1(ctx)
        default:
            break
    }
})

playingRouter.on('eat', (ctx) => {
    switch (ctx.session.playingState.name) {
        case 'eat_others':
            ctx.editMessageText('食' + ctx.state.value + '番')
            ctx.session.playingState.fan = ctx.state.value
            return eat_others_step2(ctx)
        case 'eat_self':
            ctx.editMessageText('食' + ctx.state.value + '番')
            ctx.session.playingState.fan = ctx.state.value
            return eat_self_step2(ctx)
    }
})

playingRouter.on('select', (ctx) => {
    if (ctx.session.playingState) {
        switch (ctx.session.playingState.name) {
            case 'eat_others':
                switch (ctx.session.playingState.steps) {
                    case 2:
                        ctx.editMessageText(getName(ctx, ctx.state.value) + '食')
                        ctx.session.playingState.win = ctx.state.value
                        return eat_others_step3(ctx)
                    case 3:
                        if (ctx.state.value == ctx.session.playingState.win) {
                            ctx.editMessageText('佢自己出沖比自己你訓醒未？')
                            return eat_others_step3(ctx)
                        }
                        ctx.editMessageText(getName(ctx, ctx.state.value) + '出沖')
                        ctx.session.playingState.lose = ctx.state.value
                        return finish_marking(ctx)
                }
                break
            case 'eat_self':
                switch (ctx.session.playingState.steps) {
                    case 2:
                        ctx.editMessageText(getName(ctx, ctx.state.value) + '自摸')
                        ctx.session.playingState.win = ctx.state.value
                        return finish_marking(ctx)
                }
            default:
                break
        }

    }
})

// Markup.callbackButton('自摸','eat_self'),
//     Markup.callbackButton('詐糊 :o)','eat_failed')])')

// Common functions
function genMembers(ctx) {
    var array_of_member = []
    Object.keys(ctx.session.players).forEach(function (key) {
        var val = ctx.session.players[key];
        array_of_member.push([Markup.callbackButton(val, 'select:' + val)])
    })
    return Markup.inlineKeyboard(array_of_member)
        .oneTime()
        .resize()
        .extra()
}

function askParticipant(ctx) {
    return ctx.reply('請問有邊位勇士落場打牌？',
        genSeatingKeyboard(ctx)
    )
}


function getName(ctx, seat) {
    var name = null

    switch (seat) {
        case 'north':
            name = ctx.session.game.seat_north
            break
        case 'east':
            name = ctx.session.game.seat_east
            break
        case 'west':
            name = ctx.session.game.seat_west
            break
        case 'south':
            name = ctx.session.game.seat_south
            break
    }

    if (name) {
        return ' ' + name
    } else {
        return ''
    }
}

function getFanValue(ctx, fan) {
    var fanValue = 0;
    Object.keys(ctx.session.game.pricelist).forEach(function (key) {
        var val = ctx.session.game.pricelist[key];
        if (val['fan'] == fan) {
            fanValue = val['value']
        }
    });

    return fanValue
}

function genSeatingKeyboard(ctx) {
    return Markup.inlineKeyboard([
        [ Markup.callbackButton('   ', ' '), Markup.callbackButton('北位' + getName(ctx, 'north'), 'north'), Markup.callbackButton('   ', ' ')],
        [ Markup.callbackButton('西位' + getName(ctx, 'west'), 'west'), Markup.callbackButton('   ', ' '), Markup.callbackButton('東位' + getName(ctx, 'east'), 'east')],
        [ Markup.callbackButton('   ', ' '), Markup.callbackButton('南位' + getName(ctx, 'south'), 'south'), Markup.callbackButton('   ', ' ')],
        [ Markup.callbackButton('開打啦','finish')]
    ])
        .oneTime()
        .resize()
        .extra()
}

function eatAGame(ctx) {
    return ctx.reply('點食法？', Markup.inlineKeyboard([
        Markup.callbackButton('食糊','finish:eat_others'),
        Markup.callbackButton('自摸','finish:eat_self')])
            .oneTime()
            .resize()
            .extra()
    )
}

function finish_marking(ctx) {
    var replymsg = ' '
    var roundState =
    {
        state: ctx.session.playingState,
        east: 0,
        south: 0,
        west: 0,
        north: 0
    }

    switch (ctx.session.playingState.name) {
        case 'eat_others':
            ctx.session.playingState.win == 'east'? roundState.east = getFanValue(ctx, ctx.session.playingState.fan) : null
            ctx.session.playingState.win == 'south'? roundState.south = getFanValue(ctx, ctx.session.playingState.fan) : null
            ctx.session.playingState.win == 'west'? roundState.west = getFanValue(ctx, ctx.session.playingState.fan) : null
            ctx.session.playingState.win == 'north'? roundState.north = getFanValue(ctx, ctx.session.playingState.fan) : null

            ctx.session.playingState.lose == 'east'? roundState.east = -getFanValue(ctx, ctx.session.playingState.fan) : null
            ctx.session.playingState.lose == 'south'? roundState.south = -getFanValue(ctx, ctx.session.playingState.fan) : null
            ctx.session.playingState.lose == 'west'? roundState.west = -getFanValue(ctx, ctx.session.playingState.fan) : null
            ctx.session.playingState.lose == 'north'? roundState.north = -getFanValue(ctx, ctx.session.playingState.fan) : null

            ctx.session.game.rounds.push(roundState)

            replymsg = getName(ctx, ctx.session.playingState.win) + ' 食' + getName(ctx, ctx.session.playingState.lose) + ' ' + ctx.session.playingState.fan + '番 $' + getFanValue(ctx, ctx.session.playingState.fan)
            break
        case 'eat_self':
            roundState.east = ctx.session.playingState.win == 'east'? getFanValue(ctx, ctx.session.playingState.fan) * 1.5 : -getFanValue(ctx, ctx.session.playingState.fan)/2;
            roundState.south = ctx.session.playingState.win == 'south'? getFanValue(ctx, ctx.session.playingState.fan) * 1.5 : -getFanValue(ctx, ctx.session.playingState.fan)/2;
            roundState.west = ctx.session.playingState.win == 'west'? getFanValue(ctx, ctx.session.playingState.fan) * 1.5 : -getFanValue(ctx, ctx.session.playingState.fan)/2;
            roundState.north = ctx.session.playingState.win == 'north'? getFanValue(ctx, ctx.session.playingState.fan) * 1.5 : -getFanValue(ctx, ctx.session.playingState.fan)/2;

            ctx.session.game.rounds.push(roundState)

            replymsg = getName(ctx, ctx.session.playingState.win) + ' 食' + getName(ctx, ctx.session.playingState.lose) + ' ' + ctx.session.playingState.fan + '番 $' + getFanValue(ctx, ctx.session.playingState.fan)
            break
    }

    ctx.session.playingState = null

    return ctx.reply(replymsg)
}

function genPlayerSelection(ctx) {
    return Markup.inlineKeyboard([
        [Markup.callbackButton(ctx.session.game.seat_east, 'select:east')],
        [Markup.callbackButton(ctx.session.game.seat_south, 'select:south')],
        [Markup.callbackButton(ctx.session.game.seat_west, 'select:west')],
        [Markup.callbackButton(ctx.session.game.seat_north, 'select:north')]
    ])
        .oneTime()
        .resize()
        .extra()
}

function resetGame(ctx) {
    if (!ctx.session.players) {
        ctx.session.players = {}
    }

    ctx.session.game = {
        start_time: null,
        seat_north: null,
        seat_west: null,
        seat_east: null,
        seat_south: null,
        rounds: [],
        pricelist: null
    }
}

function endGame(ctx){
    var replymsg = ''
    if (ctx.flow.current) {
        DPRINT(ctx, "ctx.flow.current.id: " + ctx.flow.current.id)

        if (ctx.flow.current.id == 'start') {
            replymsg = str_start_failed
        } else {
            replymsg = str_finished
        }

        showGameResult(ctx)
        ctx.flow.leave()
    } else {
        DPRINT(ctx, "ctx.flow.current is null")
        replymsg = str_notstarted
    }

    DPRINT(ctx, 'ctx.updateType: ' + ctx.updateType)


    return ctx.updateType == 'callback_query'? ctx.editMessageText(replymsg): ctx.reply(replymsg)
}

function showPriceList(ctx) {
    if (ctx.session.game.pricelist) {
        var str_pricelist = '';
        Object.keys(ctx.session.game.pricelist).forEach(function (key) {
            var val = ctx.session.game.pricelist[key];
            str_pricelist += val['fan'] + '番 <b>' + val['value'] + '</b>\r\n'
        });

        ctx.replyWithHTML(str_pricelist)
    }
}

function showGameResult(ctx) {
    if (ctx.session.game.rounds) {
        var str_result = '';
        var east = 0;
        var south = 0;
        var west = 0;
        var north = 0;

        str_result += padLeft(ctx.session.game.seat_east, 10, ' ')
        str_result += padLeft(ctx.session.game.seat_south, 10, ' ')
        str_result += padLeft(ctx.session.game.seat_west, 10, ' ')
        str_result += padLeft(ctx.session.game.seat_north, 10, ' ')
        str_result += '\r\n'

        Object.keys(ctx.session.game.rounds).forEach(function (key) {
            var val = ctx.session.game.rounds[key];
            str_result += padLeft(val['east'], 10, ' ') + padLeft(val['south'], 10, ' ') + padLeft(val['west'], 10, ' ') + padLeft(val['north'], 10, ' ') + '\r\n'
            east += val['east']
            south += val['south']
            west += val['west']
            north += val['north']
        });

        str_result += '\r\n'
        str_result += padLeft(east, 10, ' ') + padLeft(south, 10, ' ') + padLeft(west, 10, ' ') + padLeft(north, 10, ' ') + '\r\n'

        ctx.reply(str_result)
    }
}

function padLeft(nr, n, str){
    return Array(n-String(nr).length+1).join(str||'0')+nr;
}

flow.register(startScene)
flow.register(prepareScene)
flow.register(playingScene)

flow.command('start', (ctx) => {
    if (ctx.flow.current) {
        ctx.reply(str_playing)
    } else {
        ctx.flow.enter('start')
    }
})

flow.command('status', (ctx) => {
    var replymsg = ''
    if (ctx.flow.current == null) {
        replymsg = str_status_notstart
    } else {
        switch (ctx.flow.current.id) {
            case 'start':
                replymsg = str_status_start
                break
            case 'prepare':
                replymsg = '睇緊邊個打'
                break
            case 'playing':
                replymsg = '打緊'
                showPriceList(ctx)
                showGameResult(ctx)
                break
            default:
                replymsg = str_status_unknown
                break
        }
    }

    return ctx.reply(str_state + ': ' + replymsg)
})

flow.command('eat', (ctx) => {
    if (ctx.flow.current) {
        if (ctx.flow.current.id == 'playing') {
            return eatAGame(ctx)
        }
    }
})

flow.command('signup', (ctx) => {
    if (!ctx.session.players) {
        ctx.session.players = {}
    }

    if (ctx.session.players) {
        var name = ctx.update.message.from.first_name? ctx.update.message.from.first_name : ''
        name += ctx.update.message.from.last_name? ' ' + ctx.update.message.from.last_name : ''
        name = name.trim()
        if (name) {
            ctx.session.players[String(ctx.update.message.from.id)] = name
            return ctx.reply('加咗你個名入來啦 - ' + name)
        }
    }
})

flow.command('members', (ctx) => {
    var str_members = ''
    var i = 1
    if (ctx.session.players) {
        Object.keys(ctx.session.players).forEach(function (key) {
            var val = ctx.session.players[key]
            str_members += String(i) + '. ' + val + '\r\n'
            i++
        })
        return ctx.reply(str_members)
    }
})

flow.command('end', (ctx) => endGame(ctx))



bot.use(session.middleware())
bot.use(flow.middleware())
bot.startPolling()
