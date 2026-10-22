package fun.warnetwork.accountlink;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.UUID;
import java.util.regex.Pattern;

record PlayerIdentity(String uuid, String username, String edition) {
    private static final Pattern UUID_PATTERN = Pattern.compile("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");

    static PlayerIdentity from(Player player, Plugin plugin, boolean detectFloodgate) {
        UUID uuid = player.getUniqueId();
        String username = player.getName();
        String edition = "JAVA";
        if (detectFloodgate && plugin.getServer().getPluginManager().isPluginEnabled("floodgate")) {
            try {
                Class<?> apiType = Class.forName("org.geysermc.floodgate.api.FloodgateApi");
                Object api = apiType.getMethod("getInstance").invoke(null);
                Object floodgatePlayer = apiType.getMethod("getPlayer", UUID.class).invoke(api, player.getUniqueId());
                if (floodgatePlayer != null) {
                    Object correctUuid = floodgatePlayer.getClass().getMethod("getCorrectUniqueId").invoke(floodgatePlayer);
                    Object correctName = floodgatePlayer.getClass().getMethod("getCorrectUsername").invoke(floodgatePlayer);
                    if (correctUuid instanceof UUID bedrockUuid) uuid = bedrockUuid;
                    if (correctName instanceof String bedrockName && !bedrockName.isBlank()) username = bedrockName;
                    edition = "BEDROCK";
                }
            } catch (ReflectiveOperationException exception) {
                plugin.getLogger().warning("Floodgate was detected but its API could not be read. This player will use the server UUID as a Java identity.");
            }
        }
        return new PlayerIdentity(uuid.toString().toLowerCase(), username, edition);
    }

    boolean isValid() {
        return UUID_PATTERN.matcher(uuid).matches() && username != null && username.matches("[A-Za-z0-9_ ]{1,32}") && (edition.equals("JAVA") || edition.equals("BEDROCK"));
    }
}
