package fun.warnetwork.accountlink;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerIdentityTest {
    @Test void acceptsServerSuppliedJavaAndBedrockUuidIdentities() {
        assertTrue(new PlayerIdentity("550e8400-e29b-41d4-a716-446655440000", "WarPlayer_1", "JAVA").isValid());
        assertTrue(new PlayerIdentity("a8098c1a-f86e-11da-bd1a-00112444be1e", "Bedrock Name", "BEDROCK").isValid());
    }

    @Test void rejectsMalformedOrUntrustedIdentityFields() {
        assertFalse(new PlayerIdentity("not-a-uuid", "WarPlayer", "JAVA").isValid());
        assertFalse(new PlayerIdentity("550e8400-e29b-41d4-a716-446655440000", "Name/Other", "JAVA").isValid());
        assertFalse(new PlayerIdentity("550e8400-e29b-41d4-a716-446655440000", "WarPlayer", "CONSOLE").isValid());
    }
}
