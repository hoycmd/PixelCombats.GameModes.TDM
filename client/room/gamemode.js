import { DisplayValueHeader } from 'pixel_combats/basic';
import { Game, Players, Inventory, LeaderBoard, BuildBlocksSet, Teams, Damage, BreackGraph, Ui, Properties, GameMode, Spawns, Timers, TeamsBalancer, NewGame, NewGameVote } from 'pixel_combats/room';
import * as teams from './default_teams.js';
import * as default_timer from './default_timer.js';

// настройки
const WaitingPlayersTime = 11;
const BuildBaseTime = 31;
const KnivesModeTime = 41;
const GameModeTime = default_timer.game_mode_length_seconds();
const MockModeTime = 11;
const EndOfMatchTime = 9;
const VoteTime = 10;
const KILL_SCORES = 5;
const WINNER_SCORES = 10;
const TIMER_SCORES = 5;
const SCORES_TIMER_INTERVAL = 30;

// имена используемых объектов
const WaitingStateValue = "Waiting";
const BuildModeStateValue = "BuildMode";
const KnivesModeStateValue = "KnivesMode";
const GameStateValue = "Game";
const MockModeStateValue = "MockMode";
const EndOfMatchStateValue = "EndOfMatch";
const immortalityTimerName = "immortality"; // имя таймера, используемого в контексте игрока, для его бессмертия
const KILLS_PROP_NAME = "Kills";
const SCORES_PROP_NAME = "Scores";

// получаем объекты, с которыми работает режим
const mainTimer = Timers.GetContext().Get("Main");
const scoresTimer = Timers.GetContext().Get(SCORES_PROP_NAME);
const stateProp = Properties.GetContext().Get("State");

// инициализация команд
function CreateNewTeam(TeamName, TeamDisplayName, TeamColor, TeamSpawnPointGroup, TeamBuildBlocksSet) {
 Teams.Add(TeamName, TeamDisplayName, TeamColor);
const NewTeam = Teams.Get(TeamName);
 NewTeam.Spawns.SpawnPointsGroups.Add(TeamSpawnPointGroup);
 NewTeam.Build.BlocksSet.Value = TeamBuildBlocksSet;
  return NewTeam;
}

// применяем параметры конструктора режима
const MapRotation = GameMode.Parameters.GetBool("MapRotation");
Damage.GetContext().FriendlyFire.Value = GameMode.Parameters.GetBool("FriendlyFire");
BreackGraph.WeakBlocks = GameMode.Parameters.GetBool("LoosenBlocks");
BreackGraph.OnlyPlayerBlocksDmg = GameMode.Parameters.GetBool("OnlyPlayerBlocksDmg");

// опции
Properties.GetContext().GameModeName.Value = "GameModes/Team Dead Match"; // имя игрового режима (устарело)
TeamsBalancer.IsAutoBalance = true; // балансер команд
BreackGraph.PlayerBlocksBoost = true; // буст блока игрока
Ui.GetContext().MainTimerId.Value = mainTimer.Id // айди (индификатор) таймера
// создаем стандартные команды (Новый прототип команд, который не использует файл, или строки 
const blueTeam = CreateNewTeam("Blue", "Red\nСиние", new Color(0, 0, 125/255, 0), 1, BuildBlocksSet.Blue);
const redTeam = CreateNewTeam("Red", "Blue\nКрасные", new Color(125/255, 0, 0, 0), 2, BuildBlocksSet.Red);

// настраиваем параметры, которые нужно выводить в лидерборде
LeaderBoard.PlayerLeaderBoardValues = [
	new DisplayValueHeader(KILLS_PROP_NAME, "Statistics/Kills", "Statistics/KillsShort"),
	new DisplayValueHeader("Deaths", "Statistics/Deaths", "Statistics/DeathsShort"),
	new DisplayValueHeader("Spawns", "Statistics/Spawns", "Statistics/SpawnsShort"),
	new DisplayValueHeader(SCORES_PROP_NAME, "Statistics/Scores", "Statistics/ScoresShort")
];
LeaderBoard.TeamLeaderBoardValue = new DisplayValueHeader(SCORES_PROP_NAME, "Statistics\Scores", "Statistics\Scores");
// задаем сортировку команд для списка лидирующих
LeaderBoard.TeamWeightGetter.Set(function (team) {
	return team.Properties.Get(SCORES_PROP_NAME).Value;
});
// задаем сортировку игроков для списка лидирующих
LeaderBoard.PlayersWeightGetter.Set(function (player) {
	return player.Properties.Get(SCORES_PROP_NAME).Value;
});

// отображаем значения вверху экрана
Ui.GetContext().TeamProp1.Value = { Team: "Blue", Prop: SCORES_PROP_NAME };
Ui.GetContext().TeamProp2.Value = { Team: "Red", Prop: SCORES_PROP_NAME };

// при запросе смены команды игрока - добавляем его в запрашиваемую команду
Teams.OnRequestJoinTeam.Add(function (p, t) { t.Add(p); });
// при запросе спавна игрока - спавним его
Teams.OnPlayerChangeTeam.Add(function (p) { p.Spawns.Spawn() });

// бессмертие после респавна
Spawns.GetContext().OnSpawn.Add(function (p) {
if (stateProp.Value == MockModeStateValue) p.Properties.Immortality.Value = false; 
 return;
	p.Properties.Immortality.Value = true;
	p.Timers.Get(immortalityTimerName).Restart(3);
});
Timers.OnPlayerTimer.Add(function (t) {
	if (t.Id != immortalityTimerName) t.Player.Properties.Immortality.Value = false;
});

// обработчик спавнов
Spawns.OnSpawn.Add(function (player) {
	if (stateProp.Value == MockModeStateValue) return;
	++player.Properties.Spawns.Value;
});
// обработчик смертей
Damage.OnDeath.Add(function (p) {
if (stateProp.Value == MockModeStateValue) Spawns.GetContext(p).Spawn();
 return;
	++player.Properties.Deaths.Value;
});
// обработчик убийств
Damage.OnKill.Add(function (p, k) {
	if (stateProp.Value == MockModeStateValue) return;
	if (p.id !== k.id) ++p.Properties.Kills.Value;
		// добавляем очки кила игроку и команде
		p.Properties.Scores.Value += KILL_SCORES;
		if (stateProp.Value !== MockModeStateValue && p.Team != null) p.Team.Properties.Get(SCORES_PROP_NAME).Value += KILL_SCORES;
});

// таймер очков за проведенное время
scoresTimer.OnTimer.Add(function () {
 for (const p of Players.All) {
		if (p.Team === null) continue; // если вне команд то не начисляем ничего по таймеру
		p.Properties.Scores.Value += TIMER_SCORES;
	}
});

// таймер переключения состояний
mainTimer.OnTimer.Add(function () {
	switch (stateProp.Value) {
		case WaitingStateValue:
			SetBuildMode();
			break;
		case BuildModeStateValue:
			SetKnivesMode();
			break;
		case KnivesModeStateValue:
			SetGameMode();
			break;
		case GameStateValue:
			SetEndOfMatch();
			break;
		case MockModeStateValue:
			SetEndOfMatch_EndMode();
			break;
		case EndOfMatchStateValue:
			start_vote();
			break;
	}
});

// изначально задаем состояние ожидания других игроков
SetWaitingMode();

// состояния игры
function SetWaitingMode() {
	stateProp.Value = WaitingStateValue;
	Ui.GetContext().Hint.Value = "Ожидание, всех - игроков...";
	Spawns.GetContext().enable = false;
	mainTimer.Restart(WaitingPlayersTime);
}
function SetBuildMode() {
	stateProp.Value = BuildModeStateValue;
	Ui.GetContext().Hint.Value = "Застраивайте базу, и разрушайте базу - врагов!";
	const inventory = Inventory.GetContext();
	inventory.Main.Value = false;
	inventory.Secondary.Value = false;
	inventory.Melee.Value = true;
	inventory.Explosive.Value = false;
	inventory.Build.Value = true;
	// запрет нанесения урона
	Damage.GetContext().DamageOut.Value = false;

	mainTimer.Restart(BuildBaseTime);
	Spawns.GetContext().enable = true;
	SpawnTeams();
}
if (!GameMode.Paramters.GetBool("OnlyKnives")) {
function SetKnivesMode() {
	stateProp.Value = KnivesModeStateValue;
	Ui.GetContext().Hint.Value = "Поножовщина!";
	var inventory = Inventory.GetContext();
	inventory.Main.Value = false;
	inventory.Secondary.Value = false;
	inventory.Melee.Value = true;
	inventory.Explosive.Value = false;
	inventory.Build.Value = true;
	// разрешение нанесения урона
	Damage.GetContext().DamageOut.Value = true;

	mainTimer.Restart(KnivesModeTime);
	Spawns.GetContext().enable = true;
	SpawnTeams();
 }
}
function SetGameMode() {
	// разрешаем нанесение урона
	Damage.GetContext().DamageOut.Value = true;
	stateProp.Value = GameStateValue;
	Ui.GetContext().Hint.Value = "Нападайте, на всех - врагов!";

	var inventory = Inventory.GetContext();
	if (GameMode.Parameters.GetBool("OnlyKnives")) {
		inventory.Main.Value = false;
		inventory.Secondary.Value = false;
		inventory.Melee.Value = true;
		inventory.Explosive.Value = false;
		inventory.Build.Value = true;
	} else {
		inventory.Main.Value = true;
		inventory.Secondary.Value = true;
		inventory.Melee.Value = true;
		inventory.Explosive.Value = true;
		inventory.Build.Value = true;
	}

	mainTimer.Restart(GameModeTime);
	Spawns.GetContext().Despawn();
	SpawnTeams();
}
function SetEndOfMatch() {
	scoresTimer.Stop(); // выключаем таймер очков
	const leaderboard = LeaderBoard.GetTeams();
	if (leaderboard[0].Weight !== leaderboard[1].Weight) {
		// режим прикола вконце катки
		SetMockMode(leaderboard[0].Team, leaderboard[1].Team);
		// добавляем очки победившим
		for (const win_player of leaderboard[0].Team.Players) {
			win_player.Properties.Scores.Value += WINNER_SCORES;
		}
	}
	else {
		SetEndOfMatch_EndMode();
	}
}
function SetMockMode(winners, loosers) {
	// задаем состояние игры
	stateProp.Value = MockModeStateValue;
	scoresTimer.Stop(); // выключаем таймер очков

	// подсказка
	Ui.GetContext(winners).Hint.Value = "Hint/MockHintForWinners";
	Ui.GetContext(loosers).Hint.Value = "Hint/MockHintForLoosers";

	// разрешаем нанесение урона
	Damage.GetContext().DamageOut.Value = true;
	// время спавна
	Spawns.GetContext().RespawnTime.Value = 2;

	// set loosers
	var inventory = Inventory.GetContext(loosers);
	inventory.Main.Value = false;
	inventory.Secondary.Value = false;
	inventory.Melee.Value = false;
	inventory.Explosive.Value = false;
	inventory.Build.Value = false;

	// set winners
	inventory = Inventory.GetContext(winners);
	inventory.MainInfinity.Value = true;
	inventory.SecondaryInfinity.Value = true;
	inventory.ExplosiveInfinity.Value = true;
	inventory.BuildInfinity.Value = true;

	// френдли фаер для победивших
	//Damage.GetContext(winners).FriendlyFire.Value = true;

	// перезапуск таймера мода
	mainTimer.Restart(MockModeTime);
}
function SetEndOfMatch_EndMode() {
	stateProp.Value = EndOfMatchStateValue;
	scoresTimer.Stop(); // выключаем таймер очков
	Ui.GetContext().Hint.Value = "Конец, матча!";

	var spawns = Spawns.GetContext();
	spawns.enable = false;
	spawns.Despawn();

	Game.GameOver(LeaderBoard.GetTeams());
	mainTimer.Restart(EndOfMatchTime);
}

function OnVoteResult(v) {
	if (v.Result === null) return;
	NewGame.RestartGame(v.Result);
}
NewGameVote.OnResult.Add(OnVoteResult); // вынесено из функции, которая выполняется только на сервере, чтобы не зависало, если не отработает, также чтобы не давало баг, если вызван метод 2 раза и появилось 2 подписки

function start_vote() {
	NewGameVote.Start({
		Variants: [{ MapId: 0 }],
		Timer: VoteTime
	}, MapRotation ? 3 : 0);
}

function SpawnTeams() {
	for (const t of Teams)
		Spawns.GetContext(t).Spawn();
}

scores_timer.RestartLoop(SCORES_TIMER_INTERVAL);

