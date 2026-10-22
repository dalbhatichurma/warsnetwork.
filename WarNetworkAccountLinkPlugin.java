package fun.warnetwork.accountlink;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import org.bukkit.Bukkit;
import org.bukkit.Statistic;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;

import java.lang.reflect.Method;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

public final class WarNetworkAccountLinkPlugin extends JavaPlugin implements CommandExecutor {
    private HttpClient http;
    private String apiBase;
    private String websiteUrl;
    private String apiToken;
    private final Map<UUID, Long> unlinkConfirmations = new ConcurrentHashMap<>();
    private final Map<UUID, Long> commandCooldowns = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        apiBase = trimSlash(getConfig().getString("api.base-url", ""));
        websiteUrl = trimSlash(getConfig().getString("website-url", ""));
        apiToken = getConfig().getString("api.plugin-token", "").trim();
        if (!validEndpoint(apiBase) || !validEndpoint(websiteUrl)) {
            getLogger().severe("Set api.base-url and website-url to your website's HTTPS origin in plugins/WarNetworkAccountLink/config.yml.");
        }
        if (apiToken.length() < 32 || apiToken.startsWith("CHANGE_ME")) {
            getLogger().severe("Plugin API token is not configured. Set api.plugin-token to the same private token as WN_PLUGIN_API_TOKEN on the website server.");
        }
        if (getConfig().getBoolean("sync.floodgate-bedrock-detection", true) && !Bukkit.getPluginManager().isPluginEnabled("floodgate")) {
            getLogger().info("Floodgate is not installed; players will link with their server UUID as Java identities. Install Floodgate to enable Bedrock identity detection.");
        }
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        if (getCommand("linkaccount") != null) getCommand("linkaccount").setExecutor(this);
        if (getCommand("unlinkaccount") != null) getCommand("unlinkaccount").setExecutor(this);
        long interval = Math.max(60, getConfig().getLong("sync.interval-seconds", 300));
        if (getConfig().getBoolean("sync.enabled", true)) {
            Bukkit.getScheduler().runTaskTimer(this, this::syncOnlinePlayers, 40L, interval * 20L);
        }
        getLogger().info("Account-link commands ready. Minecraft-to-Discord linking requires the website OAuth and plugin token configuration.");
    }

    @Override
    public void onDisable() {
        if (http != null && getConfig().getBoolean("sync.enabled", true)) syncOnlinePlayers();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) { sender.sendMessage("These commands must be used by a player in game."); return true; }
        if (!player.hasPermission(command.getPermission())) { player.sendMessage(Component.text("You do not have permission to use this command.")); return true; }
        if (isUnconfigured()) { player.sendMessage(Component.text("Account linking is not configured yet. Please contact WarNetwork staff.")); return true; }
        if (command.getName().equalsIgnoreCase("unlinkaccount")) { handleUnlink(player, args); return true; }
        handleLink(player, args);
        return true;
    }

    private void handleLink(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(Component.text("Link your account: sign in with Discord on the WarNetwork website and create a one-time code."));
            player.sendMessage(Component.text("Then run /linkaccount <code>. ").append(Component.text("OPEN ACCOUNT PAGE").clickEvent(ClickEvent.openUrl(websiteUrl + "/account"))));
            return;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("status")) { queryLinkStatus(player); return; }
        if (args.length != 1 || !args[0].matches("(?i)[a-f0-9]{10}")) {
            player.sendMessage(Component.text("Usage: /linkaccount <10-character code> · Check status with /linkaccount status.")); return;
        }
        if (!takeCooldown(player)) return;
        PlayerIdentity identity = identity(player);
        if (!identity.isValid()) { player.sendMessage(Component.text("The server supplied an invalid player identity. Contact staff.")); return; }
        player.sendMessage(Component.text("Verifying your one-time code securely…"));
        String body = "{\"code\":" + ApiJson.quote(args[0].toUpperCase()) + ",\"uuid\":" + ApiJson.quote(identity.uuid()) + ",\"username\":" + ApiJson.quote(identity.username()) + ",\"edition\":" + ApiJson.quote(identity.edition()) + "}";
        send("POST", "/api/v1/internal/link/verify", body).whenComplete((response, failure) -> onMain(() -> {
            if (failure != null) { player.sendMessage(Component.text("WarNetwork account service is unreachable. Try again in a moment.")); return; }
            if (response.statusCode() == 200 && ApiJson.trueField(response.body(), "linked")) {
                String profilePath = ApiJson.stringField(response.body(), "profilePath");
                player.sendMessage(Component.text("Your " + identity.edition().toLowerCase() + " account is now linked to Discord."));
                String profileUrl = websiteUrl + (profilePath.startsWith("/") ? profilePath : "/account");
                player.sendMessage(Component.text("VIEW YOUR PLAYER PROFILE").clickEvent(ClickEvent.openUrl(profileUrl)));
            } else player.sendMessage(Component.text(apiError(response.body(), response.statusCode())));
        }));
    }

    private void queryLinkStatus(Player player) {
        PlayerIdentity identity = identity(player);
        String query = "?edition=" + identity.edition() + "&uuid=" + URLEncoder.encode(identity.uuid(), StandardCharsets.UTF_8);
        player.sendMessage(Component.text("Checking your account link…"));
        send("GET", "/api/v1/internal/link/status" + query, null).whenComplete((response, failure) -> onMain(() -> {
            if (failure != null) { player.sendMessage(Component.text("Account status is unavailable. Please try again shortly.")); return; }
            if (response.statusCode() != 200) { player.sendMessage(Component.text(apiError(response.body(), response.statusCode()))); return; }
            if (ApiJson.trueField(response.body(), "linked")) player.sendMessage(Component.text("This " + identity.edition().toLowerCase() + " Minecraft account is linked to Discord. ").append(Component.text("OPEN PLAYER PROFILE").clickEvent(ClickEvent.openUrl(websiteUrl + "/player/" + URLEncoder.encode(identity.username(), StandardCharsets.UTF_8)))));
            else player.sendMessage(Component.text("This Minecraft account is not linked. Sign in at " + websiteUrl + "/account to create a link code."));
        }));
    }

    private void handleUnlink(Player player, String[] args) {
        if (args.length == 0) {
            unlinkConfirmations.put(player.getUniqueId(), System.currentTimeMillis() + getConfig().getLong("link-code.confirm-expiry-seconds", 60) * 1000L);
            player.sendMessage(Component.text("This disconnects this Minecraft identity from its Discord account but keeps historical stats. Confirm with /unlinkaccount confirm within 60 seconds.")); return;
        }
        Long expiry = unlinkConfirmations.remove(player.getUniqueId());
        if (args.length != 1 || !args[0].equalsIgnoreCase("confirm") || expiry == null || expiry < System.currentTimeMillis()) {
            player.sendMessage(Component.text("No active confirmation. Start again with /unlinkaccount.")); return;
        }
        if (!takeCooldown(player)) return;
        PlayerIdentity identity = identity(player);
        String body = "{\"uuid\":" + ApiJson.quote(identity.uuid()) + ",\"edition\":" + ApiJson.quote(identity.edition()) + "}";
        player.sendMessage(Component.text("Unlinking this Minecraft identity…"));
        send("POST", "/api/v1/internal/link/unlink", body).whenComplete((response, failure) -> onMain(() -> {
            if (failure != null) player.sendMessage(Component.text("WarNetwork account service is unreachable. Try again in a moment."));
            else if (response.statusCode() == 200) player.sendMessage(Component.text("Account unlinked. Your historical statistics remain saved."));
            else player.sendMessage(Component.text(apiError(response.body(), response.statusCode())));
        }));
    }

    private void syncOnlinePlayers() {
        if (http == null || isUnconfigured() || !getConfig().getBoolean("sync.enabled", true)) return;
        List<String> records = new ArrayList<>();
        for (Player player : Bukkit.getOnlinePlayers()) {
            PlayerIdentity identity = identity(player);
            if (!identity.isValid()) continue;
            String rank = currentRank(player);
            Double balance = getConfig().getBoolean("sync.vault-balance", true) ? vaultBalance(player) : null;
            int playtime = Math.max(0, player.getStatistic(Statistic.PLAY_ONE_MINUTE) / (20 * 60));
            String balanceJson = balance == null ? "null" : Double.toString(balance);
            records.add("{\"uuid\":" + ApiJson.quote(identity.uuid()) + ",\"username\":" + ApiJson.quote(identity.username()) + ",\"edition\":" + ApiJson.quote(identity.edition()) + ",\"rank\":" + ApiJson.quote(rank) + ",\"kills\":" + Math.max(0, player.getStatistic(Statistic.PLAYER_KILLS)) + ",\"deaths\":" + Math.max(0, player.getStatistic(Statistic.DEATHS)) + ",\"playtimeMinutes\":" + playtime + ",\"balance\":" + balanceJson + ",\"coins\":null}");
        }
        if (records.isEmpty()) return;
        send("POST", "/api/v1/internal/player/sync", "{\"players\":[" + String.join(",", records) + "]}").exceptionally(failure -> null);
    }

    private PlayerIdentity identity(Player player) {
        return PlayerIdentity.from(player, this, getConfig().getBoolean("sync.floodgate-bedrock-detection", true));
    }

    private String currentRank(Player player) {
        if (!getConfig().getBoolean("sync.luckperms-rank", true) || !Bukkit.getPluginManager().isPluginEnabled("LuckPerms")) return "Member";
        try {
            Class<?> apiType = Class.forName("net.luckperms.api.LuckPerms");
            RegisteredServiceProvider<?> registration = Bukkit.getServicesManager().getRegistration(apiType);
            if (registration == null) return "Member";
            Object api = registration.getProvider();
            Object userManager = api.getClass().getMethod("getUserManager").invoke(api);
            Object user = userManager.getClass().getMethod("getUser", UUID.class).invoke(userManager, player.getUniqueId());
            if (user == null) return "Member";
            Object group = user.getClass().getMethod("getPrimaryGroup").invoke(user);
            return group instanceof String value && !value.isBlank() ? value.substring(0, Math.min(48, value.length())) : "Member";
        } catch (ReflectiveOperationException exception) { return "Member"; }
    }

    private Double vaultBalance(Player player) {
        if (!Bukkit.getPluginManager().isPluginEnabled("Vault")) return null;
        try {
            Class<?> economyType = Class.forName("net.milkbowl.vault.economy.Economy");
            RegisteredServiceProvider<?> registration = Bukkit.getServicesManager().getRegistration(economyType);
            if (registration == null) return null;
            Object economy = registration.getProvider();
            Method method = economyType.getMethod("getBalance", org.bukkit.OfflinePlayer.class);
            Object result = method.invoke(economy, player);
            return result instanceof Number number && Double.isFinite(number.doubleValue()) && number.doubleValue() >= 0 ? number.doubleValue() : null;
        } catch (ReflectiveOperationException exception) { return null; }
    }

    private CompletableFuture<HttpResponse<String>> send(String method, String route, String body) {
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(apiBase + route)).timeout(Duration.ofSeconds(8)).header("Authorization", "Bearer " + apiToken).header("Accept", "application/json");
            if (body == null) request.GET(); else request.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(body));
            return http.sendAsync(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (RuntimeException exception) { return CompletableFuture.failedFuture(exception); }
    }

    private String apiError(String body, int status) {
        String error = ApiJson.stringField(body, "error");
        if (!error.isBlank()) return error;
        return status == 410 ? "That code expired. Create a new one on the website." : "The account link could not be completed. Check your code and try again.";
    }
    private void onMain(Runnable task) { if (isEnabled()) Bukkit.getScheduler().runTask(this, task); }
    private boolean takeCooldown(Player player) {
        long now = System.currentTimeMillis(); long next = commandCooldowns.getOrDefault(player.getUniqueId(), 0L);
        if (next > now) { player.sendMessage(Component.text("Please wait a few seconds before using another link command.")); return false; }
        commandCooldowns.put(player.getUniqueId(), now + 3000); return true;
    }
    private boolean isUnconfigured() { return http == null || !validEndpoint(apiBase) || apiToken.length() < 32 || apiToken.startsWith("CHANGE_ME"); }
    private String trimSlash(String value) { return value == null ? "" : value.replaceAll("/+$", ""); }
    private boolean validEndpoint(String value) {
        if (value == null || value.isBlank()) return false;
        try { URI uri = URI.create(value); boolean localHttp = "http".equalsIgnoreCase(uri.getScheme()) && ("localhost".equalsIgnoreCase(uri.getHost()) || "127.0.0.1".equals(uri.getHost())); return ("https".equalsIgnoreCase(uri.getScheme()) || (getConfig().getBoolean("api.allow-insecure-http-for-local-testing", false) && localHttp)) && uri.getHost() != null; }
        catch (IllegalArgumentException exception) { return false; }
    }
}
