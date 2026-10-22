package fun.warnetwork.accountlink;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiJsonTest {
    @Test void quotesStringsForJsonWithoutBreakingPlayerNames() {
        assertEquals("\"A\\\"B\\\\C\\n\"", ApiJson.quote("A\"B\\C\n"));
    }

    @Test void readsLinkResponsesAndEscapedErrorMessages() {
        assertTrue(ApiJson.trueField("{\"linked\":true}", "linked"));
        assertFalse(ApiJson.trueField("{\"linked\":false}", "linked"));
        assertEquals("Code expired", ApiJson.stringField("{\"error\":\"Code expired\"}", "error"));
        assertEquals("A\"B", ApiJson.stringField("{\"name\":\"A\\\"B\"}", "name"));
    }
}
