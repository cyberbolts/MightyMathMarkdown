const debugMode = false;

const INLINE_STYLE = 0;
const DISPLAY_STYLE = 1;

function toMathML(s, isDisplayStyle) {
	s = s.replace(/\t/g, "  ");

	lines = s.split("\n");
	handleBraceArrows(lines);
	s = lines.join(" ");

	if (debugMode) console.log(s);

	let tree = parse(s);
	doLayout(tree);
	let result = write(tree, isDisplayStyle);

	if (debugMode) console.log(result);

	return result;
}

// Types of Nodes
const GRID = 0;
const GRIDROW = 1;
const CELL = 2;
const ROW = 3;
const CLUSTER = 4;
const BRACKETED = 5;
const IDENTIFIER = 6;
const OPERATOR = 7;
const TEXT = 8;
const NUMBER = 9;
const FRACTION = 10;
const SCRIPTED = 11;
const ROOT = 12;
const LIMITS = 13;
const OVERBRACE = 14;
const UNDERBRACE = 15;
// TODO: VINCULUM

function parse(s) {
	let parseObject = {};
	parseObject.s = s;
	parseObject.i = 0;
	parseObject.expectTerm = true;
	parseObject.expectBracket = "";

	return parseGrid(parseObject);
}

function matchString(p, s) {
	if (p.i + s.length > p.s.length) {
		return false;
	}

	if (s.length == 1) {
		if (p.s[p.i] === s) {
			++p.i;
			return true;
		}
		return false;
	}

	if (p.s.substring(p.i, p.i + s.length) === s) {
		p.i += s.length;
		return true;
	}
	return false;
}

const indent = "  "; // Two space indent

function pad(s, nesting) {
	if (debugMode) {
		return indent.repeat(nesting) + s + "\n";
	}
	return s;
}

function writeGrid(nesting) {
	let result = "";

	result += pad("<mtable>", nesting);
	for (let gridrow of this.gridrows) {
		result += gridrow.write(nesting + 1);
	}
	result += pad("</mtable>", nesting);

	return result;
}

function parseGrid(p) {
	let result = {"type": GRID, "gridrows": [], "write": writeGrid,
			"children": function(){return this.gridrows} };

	while(p.i < p.s.length) {
		if (matchString(p, ';')) {
			;
			p.expectTerm = true;
		} else {
			let gridrow = parseGridRow(p);
			if (gridrow) {
				result.gridrows.push(gridrow);
			} else {
				break;
			}
		}
	}

	if (result.gridrows.length == 1 && result.gridrows[0].cells.length == 1) {
		return result.gridrows[0].cells[0].row;
	}
	return result;
}

function writeGridRow(nesting) {
	let result = "";

	result += pad("<mtr>", nesting);
	for (let cell of this.cells) {
		result += cell.write(nesting + 1);
	}
	result += pad("</mtr>", nesting);

	return result;
}

function parseGridRow(p) {
	let result = {"type": GRIDROW, "cells": [], "write": writeGridRow,
			"children": function(){return this.cells} };

	while (p.i < p.s.length) {
		if (matchString(p, "  ")) {  // Two spaces
			while (p.s[p.i] == ' ') {
				++p.i;
			}
			p.expectTerm = true;
		} else {
			let cell = parseCell(p);
			if (cell) {
				result.cells.push(cell);
			} else {
				break;
			}
		}
	}

	if (result.cells.length == 1) {
		// Do nothing. Cells cannot be elided (unless the entire grid row is elided).
	}

	if (result.cells.length == 0) {
		return "";  // Elide the grid row.
	}
	return result;
}

function writeCell(nesting) {
	let result = "";

	result += pad("<mtd>", nesting);
	result += this.row.write(nesting + 1);
	result += pad("</mtd>", nesting);

	return result;
}

function parseCell(p) {
	let result = {"type": CELL, "row": parseRow(p), "write": writeCell,
			"children": function(){return [this.row]} };

	if (!result.row) {
		return "";
	}

	return result;
}

function writeRow(nesting) {
	let result = "";

	result += pad("<mrow>", nesting);
	for (let element of this.elements) {
		result += element.write(nesting + 1);
	}
	result += pad("</mrow>", nesting);

	return result;
}

function parseRow(p) {
	let result = {"type": ROW, "elements": [], "write": writeRow,
			"children": function(){return this.elements} };

	while (p.i < p.s.length) {
		if (p.s[p.i] == ' ' && (p.i + 1 == p.s.length || p.s[p.i + 1] != ' ')) {
			// Rows can contain single spaces, but not double spaces
			++p.i;
		} else {
			let cluster = parseCluster(p);
			if (cluster) {
				result.elements.push(cluster);
			} else {
				break;
			}
			if (matchString(p, "..")) {
				// Dot-dot is used to separate ranges. It can't be in a cluster.
				let dotdot = {"type": OPERATOR, "operator": "..", "write": writeOperator};
				result.elements.push(dotdot);
				p.expectTerm = true;
			}
		}
	}

	if (result.elements.length == 0) {
		return "";
	}
	if (result.elements.length == 1) {
		return result.elements[0];
	}

	return result;
}

function parseCluster(p) {
	let result = {"type": CLUSTER, "elements": [], "write": writeRow,
		"children": function(){return this.elements} };

	while (p.i < p.s.length) {
		if (p.expectBracket && matchString(p, p.expectBracket)) {
			// We don't want to match the final bracket
			p.i -= p.expectBracket.length;  // Rewind
			break;
		} else if (p.expectBracket == ")" && matchString(p, "]")) {
			// Allow half-open intervals like (1, 5]
			p.i -= 1;  // Rewind the "]"
			break;
		} else if (p.expectBracket == "]" && matchString(p, ")")) {
			// Allow half-open intervals like [1, 3)
			p.i -= 1;  // Rewind the ")"
			break;
		}

		let expr;
		if (expr = parseBracketed(p)) {
			result.elements.push(expr);
			p.expectTerm = false;
		} else if (expr = parseNumber(p)) {
			result.elements.push(expr);
			p.expectTerm = false;
		} else if (expr = parseText(p)) {
			result.elements.push(expr);
			p.expectTerm = false;
		} else {
			if (p.expectTerm) {
				if (expr = parseIdentifier(p)) {
					result.elements.push(expr);
					p.expectTerm = false;
				} else if (expr = parseOperator(p)) {
					if (expr.operator == "..") {
						p.i -= 2;  // Rewind
						break;
					}
					result.elements.push(expr);
					p.expectTerm = !isPostfix(expr.operator);
				} else if (expr = parseUnrecognized(p)) {
					result.elements.push(expr);
					p.expectTerm = (expr.type == OPERATOR && !isPostfix(expr.operator));
				} else {
					break;
				}
			} else {
				if (expr = parseOperator(p)) {
					if (expr.operator == "..") {
						p.i -= 2;  // Rewind
						break;
					}
					result.elements.push(expr);
					p.expectTerm = !isPostfix(expr.operator);
				} else if (expr = parseIdentifier(p)) {
					result.elements.push(expr);
					p.expectTerm = false;
				} else if (expr = parseUnrecognized(p)) {
					result.elements.push(expr);
					p.expectTerm = (expr.type == OPERATOR && !isPostfix(expr.operator));
				} else {
					break;
				}
			}
		}
	}

	if (result.elements.length == 0) {
		return "";
	}
	if (result.elements.length == 1) {
		return result.elements[0];
	}

	return result;
}

function writeBracketed(nesting) {
	let result = "";

	result += pad("<mrow>", nesting);
	if (this.left) result += pad("<mo fence=true>" + this.left + "</mo>", nesting + 1);
	if (this.contents) result += this.contents.write(nesting + 1);
	if (this.right) result += pad("<mo fence=true>" + this.right + "</mo>", nesting + 1);
	result += pad("</mrow>", nesting);

	return result;
}

function parseBracketed(p) {
	let result = {"type": BRACKETED, "left": "", "right": "", "contents": null, "write" : writeBracketed,
			"children": function(){return [this.left, this.contents, this.right]} };

	let left = "";

	let oldExpectBracket = p.expectBracket;

	if (matchString(p, '(')) {
		p.expectBracket = ")";  // TODO: Allow half-open ranges like (3, 5]
		result.left = '(';
	} else if (matchString(p, '[')) {
		p.expectBracket = "]";
		result.left = '[';
	} else if (matchString(p, '{')) {
		p.expectBracket = "}";
		result.left = '{';
	} else if (matchString(p, '|_')) {
		p.expectBracket = "_|";
		result.left = "&lfloor;";
	} else if (p.expectTerm && matchString(p, '<<')) {
		p.expectBracket = ">>";
		result.left = "&lAng;";
	} else if (p.expectTerm && matchString(p, '<')) {
		p.expectBracket = ">";
		result.left = "&lang;";
	} else if (matchString(p, '||:')) {
		p.expectBracket = ":||";
		result.left = "&par;";
	} else if (matchString(p, '|:')) {
		p.expectBracket = ":|";
		result.left = "&mid;";
	}

	if (result.left) {
		p.expectTerm = true;

		let grid = parseGrid(p);
		if (grid) {
			result.contents = grid;
		}

		if (matchString(p, ')')) {
			result.right = ')';
		} else if (matchString(p, ']')) {
			result.right = ']';
		} else if (matchString(p, '}')) {
			result.right = '}';
		} else if (matchString(p, '_|')) {
			result.right = "&rfloor;";
		} else if (matchString(p, '>>')) {
			result.right = "&rAng;";
		} else if (matchString(p, '>')) {
			result.right = "&rang;";
		} else if (matchString(p, ':||')) {
			result.right = "&par;";
		} else if (matchString(p, ':|')) {
			result.right = "&mid;";
		}

		p.expectBracket = oldExpectBracket;
		p.expectTerm = false;
	}

	if (!result.left && !result.right && !result.contents) {
		return "";
	}
	if (!result.left && !result.right && result.contents) {
		return result.contents;
	}

	return result;
}

function writeNumber(nesting) {
	return pad("<mn>" + this.number + "</mn>", nesting);
}

function isDigit(c) {
	return c >= "0" && c <= "9";
}

function isNumericSeparator(c) {
	return c == "." || c == "," || c== " ";
}

function isNumeric(s, i) {
	return isDigit(s[i]) ||
		(i + 1 < s.length && isNumericSeparator(s[i]) && isDigit(s[i + 1]));
}

function parseNumber(p) {
	let result = {"type": NUMBER, "number": "", "write": writeNumber};

	if (p.i < p.s.length && isDigit(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isNumeric(p.s, end)) {
			++end;
		}

		result.number = p.s.substring(p.i, end);
		p.i = end;

		return result;
	}

	return "";
}

function writeText(nesting) {
	let text = this.text;
	text = text.replace(/\\u/g, "&micro;");
	return pad("<mtext>&thinsp;" + text + "&nbsp;</mtext>", nesting);
}

function parseText(p) {
	// Text appears in double-quotes. Like "this".

	// TODO: Allow escaped double-quote charactes in the text

	if (matchString(p, "\"")) {
		let result = {"type": TEXT, "text": "", "write" : writeText};

		while (p.i < p.s.length && !matchString(p, "\"")) {
			result.text += p.s[p.i];
			++p.i;
		}

		return result;
	}

	return "";
}

// Note: Because of how matching works, only two kinds of keys are allowed:
// * Those that start with a non-alphabetic character
// * Those that are entirely alphabetic.
const identifierDictionary = {
	// When a letter can be an operator, prefixing it with backslash makes it an identifier again.
	"\\X" : "X",
	"\\v" : "v",
	"\\V" : "V",
	"\\o" : "o",

	// HTML 4.0 entities
	"null" : "&empty;",
	"empty" : "&empty;",

	"inf" : "&infin;",

	"deg" : "&deg;",
	"degree" : "&deg;",
	"degrees" : "&deg;",
	"°" : "&deg;",   // Some European keyboards have this as a key

	"Im" : "&image;",
	"Re" : "&real;",

	"aleph": "&alefsym;",
	"Aleph": "&alefsym;",

	// Greek letters used as math symbols
	"Alpha" : "&Alpha;",
	"Beta" : "&Beta;",
	"Gamma" : "&Gamma;",
	"Delta" : "&Delta;",
	"Epsilon" : "&Epsilon;",
	"Zeta" : "&Zeta;",
	"Eta" : "&Eta;",
	"Theta" : "&Theta;",
	"Iota" : "&Iota;",
	"Kappa" : "&Kappa;",
	"Lambda" : "&Lambda;",
	"Mu" : "&Mu;",
	"Nu" : "&Nu;",
	"Xi" : "&Xi;",
	"Omicron" : "&Omicron;",
	"Pi" : "&Pi;",
	"Rho" : "&Rho;",
	"Sigma" : "&Sigma;",
	"Tau" : "&Tau;",
	"Upsilon" : "&Upsilon;",
	"Phi" : "&Phi;",
	"Chi" : "&Chi;",
	"Psi" : "&Psi;",
	"Omega" : "&Omega;",

	"alpha" : "&alpha;",
	"beta" : "&beta;",
	"gamma" : "&gamma;",
	"delta" : "&delta;",
	"epsilon" : "&epsilon;",
	"zeta" : "&zeta;",
	"eta" : "&eta;",
	"theta" : "&theta;",
	"iota" : "&iota;",
	"kappa" : "&kappa;",
	"lambda" : "&lambda;",
	"mu" : "&mu;",
	"nu" : "&nu;",
	"xi" : "&xi;",
	"omicron" : "&omicron;",
	"pi" : "&pi;",
	"rho" : "&rho;",
	"sigma" : "&sigma;",
	"tau" : "&tau;",
	"upsilon" : "&upsilon;",
	"phi" : "&phi;",
	"chi" : "&chi;",
	"psi" : "&psi;",
	"omega" : "&omega;",

	"\\theta" : "&thetasym;",
	"\\pi" : "&piv;",
	"\\sigma" : "&sigmaf;",
	"\\upsilon" : "&upsih;",

	"\\p" : "&weierp;",

	// Non HTML 4.0
	"\\phi": "&phiv;",
};

const maxIdentifierKeyLength = 8;  // Actually only matters for the keys that start with a non-letter.

// Note: Because of how matching works, only two kinds of keys are allowed:
// * Those that start with a non-alphabetic character
// * Those that are entirely alphabetic.
const operatorDictionary = {
	//
	// The following operators are *~*MAGIC*~*. There is special code for them.
	//

	// These are punctuators more than operators.
	".."  : "..",   // Separator for ranges.
	"_"   : "_",    // Spaced: Blank (useful for aligning tables).  Non-spaced: subscripting.
	"^"   : "^",    // Spaced: Logical AND.  Non-spaced: Exponentiation.
	"."   : ".",    // Spaced: Dot product. Non-spaced: Invisible product. In number: decimal or thousands separator.
	"\\." : ".",    // Ditto, but can't be a decimal or thousands separator.
	"/"   : "/",    // Fractions

	":"   : ":",    // Alone or at end of cluster: Colon. Otherwise: RESERVED
	"\\:" : ":",    // Allow an escaped literal colon
	","   : ",",    // Just a plain comma, unless it's in a number.
	"\\," : ",",    // Ditto, but can't be interpreted as part of a number.

	// Note that the semi-colon is also a punctuator with special handling. It separates rows of a matrix.
	"\\;" : ";",   // Allow an escaped literal semicolon

	// This is a suffix
	"%" : "%",      // At end of cluster: Percent. Otherwise: RESERVED

	// Context-dependent operator
	"!" : "!",      // At start of cluster: Logical NOT.  Otherwise: Factorial.

	// These are superscript when final in a cluster. e.g. lim[x -> 0-] 1/x != lim[x -> 0+] 1/x
	"+" : "+",
	"-" : "&minus;",

	// This is also superscript when final in a cluster (complex conjugate)
	"*" : "&lowast;",

	// These are automatically superscript.
	// Note that single quotes will be treated as delimiters for identifiers (when expectTerm is true).
	// Hence the backslash-escaped versions.
	"\'" : "&prime;",
	"\\\'" : "&prime;",
	"\'\'" : "&Prime;",
	"\\\'\'" : "&Prime;",
	"\'\'\'" : "&tprime;",
	"\\\'\'\'" : "&tprime;",

	// Pseudo-operators that produce layout
	"sqrt": "sqrt",
	"root": "root",
	"overbrace": "overbrace",
	"underbrace": "underbrace",

	// These letter-like operators have special formatting
	"\\d" : "&dd;",  // Differential d

	// This is more like an identifier, but it's here to stop the parser confusing it with .. or .
	"..." : "&hellip;",
	"\\..." : "&hellip;",


	//
	// The following operators are not magic.
	//

	// These operators are ASCII text strings. Are there any other ASCII words
	// that should be treated as operators?
	// TODO: Maybe treat ASCII strings at operators if enclosed in a pair of colons. e.g. :operator:
	"lim" : "lim",
	"det" : "det",

	// HTML 4.0 entities

	"cross" : "&times;",  // cross-product
	"X" : "&times;",  // cross-product
	"dot" : "&sdot;",  // dot-product

	"not" : "&not;",
	"¬" : "&not;",  // British keyboards have this.

	"grad" : "&nabla;",
	"div" : "&nabla;&sdot;",
	"curl" : "&nabla;&times;",

	"in" : "&isin;",
	"!in" : "&notin;",
	"¬in" : "&notin;",

	"sum" : "&sum;",
	"Sum" : "&sum;",
	"prod" : "&prod;",
	"Prod" : "&prod;",

	"prop" : "&prop;",

	"and" : "&and;",
	"or" : "&or;",
	"v" : "&or;",
	"V" : "&or;",

	"cup" : "&cup;",
	"cap" : "&cap;",

	"ang" : "&ang;",

	"therefore" : "&there4;",

	"\\A:" : "&forall;",
	"\\E:" : "&exist;",

	"+/-" : "&plusmn;",

	"@" : "&part;",
	"$" : "&int;",
	"$$" : "&Int;",  // Not in HTML 4.0
	"$$$" : "&iiint;",  // Not in HTML 4.0

	"=" : "=", "==" : "=",
	"!=" : "&ne;", "!==" : "&ne;",
	"¬=" : "&ne;", "¬==" : "&ne;",

	"~" : "&sim;",
	"~~" : "&asymp;",
	"~=" : "&sime;",  // Not in HTML 4.0
	"~==" : "&cong;",
	"===" : "&equiv;",

	"<" : "&lt;",
	">" : "&gt;",
	"<=" : "&le;",
	">=" : "&ge;",

	":<:" : "&sub;",  // Subset
	":>:" : "&sup;",  // Superset
	":<=:" : "&sube;",
	":>=:" : "&supe;",
	":!<:" : "&nsub;",
	":¬<:" : "&nsub;",

	"_|_" : "&perp;",

	"(X)" : "&otimes;",
	"(+)" : "&oplus;",

	"->" : "&rarr;",  // This one has a shortform
	"-->" : "&rarr;",
	"<--" : "&larr;",
	"<-->" : "&harr;",

	"==>" : "&rArr;",
	"<==" : "&lArr;",
	"<==>" : "&hArr;",

	// Not in HTML 4.0

	"comp" : "&compfn;",
	"o" : "&compfn;",

	"||" : "&par;",
	"|" : "&mid;",

	"<<" : "&ll;",
	">>" : "&rr;",
	"<<<" : "&Ll;",
	">>>" : "&Rr;",
};

const maxOperatorKeyLength = 4;  // Actually only matters for the keys that start with a non-letter.

function isPrimeMark(op) {
	return op == "&prime;" || op == "&Prime;" || op == "&tprime;";
}

function isPostfix(op) {
	return op == "%" || op == "&hellip;" || isPrimeMark(op);
}

function writeIdentifier(nesting) {
	let isCapitalLetter = (this.identifier.length == 1 && this.identifier >= "A" && this.identifier <= "Z");
	let startTag = isCapitalLetter ? "<mi mathvariant=normal>" : "<mi>";
	return pad(startTag + this.identifier + "</mi>", nesting);
}

function isAlpha(c) {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

function parseQuotedIdentifier(p) {
	// Any string in single-quotes becomes an identifier.
	// This is useful for non-ASCII identifiers.
	// alphanumeric character (like "x") is intended to be an identifier not an operator.

	// TODO: Allow an escaped quote character in the identifier

	if (matchString(p, "\'")) {
		let result = {"type": IDENTIFIER, "identifier": "", "write" : writeIdentifier};

		while(p.i < p.s.length && !matchString(p, "\'")) {
			result.identifier += p.s[p.i];
			++p.i;
		}

		return result;
	}

	return "";
}

function parseIdentifier(p) {
	let result = parseQuotedIdentifier(p);
	if (result) {
		return result;
	}

	result = {"type": IDENTIFIER, "identifier": "", "write" : writeIdentifier};

	if (p.i >= p.s.length) {
		return "";
	}

	if (isAlpha(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		let s = p.s.substring(p.i, end);

		if (s.length == 1) {
			result.identifier = s;
			p.i = end;
			return result;
		} else if (s in identifierDictionary) {
			result.identifier = identifierDictionary[s];
			p.i = end;
			return result;
		}
	} else {
		for (let i = maxIdentifierKeyLength; i > 0; --i) {
			if (p.i + i <= p.s.length) {
				let s = p.s.substring(p.i, p.i + i)
				if (s in identifierDictionary) {
					result.identifier = identifierDictionary[s];
					p.i += i;
					return result;
				}
			}
		}
	}

	return "";
}

function writeOperator(nesting) {
	if (this.operator == "&dd;") {
		// The MathML standard says this should look like a double-struck d.
		// I don't know anyone who wants it to look like that.

		// return pad("<mspace width=thinmathspace /><mi>d</mi>", nesting);
		return pad("<mspace width=0.166em /><mi>d</mi>", nesting);
	}

	if (this.operator == "_") {
		return pad("<mspace width=1ex />", nesting);
	}

	return pad("<mo>" + this.operator + "</mo>", nesting);
}

function parseOperator(p) {
	let result = {"type": OPERATOR, "operator": "", "write": writeOperator};

	if (p.i >= p.s.length) {
		return "";
	}

	if (isAlpha(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		let s = p.s.substring(p.i, end);

		if (s in operatorDictionary) {
			result.operator = operatorDictionary[s];
			p.i = end;
			return result;
		}
	} else {
		for (let i = maxOperatorKeyLength; i > 0; --i) {
			if (p.i + i <= p.s.length) {
				let s = p.s.substring(p.i, p.i + i)
				if (s in operatorDictionary) {
					p.i += i;
					result.operator = operatorDictionary[s];
					return result;
				}
			}
		}
	}

	return "";
}

function parseUnrecognized(p) {
	// An unrecognized word or letter eventually ends up as an identifier
	if (p.i < p.s.length && isAlpha(p.s[p.i])) {
		let result = {"type": IDENTIFIER, "identifier": "", "write": writeIdentifier};

		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		result.identifier = p.s.substring(p.i, end);
		p.i = end;

		return result;
	}

	// Any other unknown character ends up as an operator.
	if (p.i < p.s.length) {
		let result = {"type": OPERATOR, "operator": "", "write": writeOperator};

		let c = p.s[p.i];
		if (c != " " && c != ";") {
			result.operator = p.s[p.i];
			++p.i;
			return result;
		}
	}

	return "";
}

function write(p, isDisplayStyle) {
	let result = "";

	if (isDisplayStyle) {
		result += pad("<math display=block>", 0);
	} else {
		result += pad("<math display=inline>", 0);
	}
	result += p.write(1);
	result += pad("</math>");

	return result;
}

function visitNodes(p, visitor) {
	visitor(p);
	if (p.children) {
		let children = p.children();
		for (child of children) {
			if (child) {
				visitNodes(child, visitor);
			}
		}
	}
}

function doLayout(p) {
	visitNodes(p, removeInvisibleOperators);
	visitNodes(p, layoutSubscripts);
	visitNodes(p, layoutExponents);
	visitNodes(p, layoutRanges);
	visitNodes(p, layoutRoots);
	visitNodes(p, layoutFractions);
	visitNodes(p, transformOperators);
	visitNodes(p, makeOperatorsSuperscript);
	visitNodes(p, layoutBraceComments);
}

function removeInvisibleOperators(p) {
	if (p.type == CLUSTER) {
		let i = 0;
		while (i < p.elements.length) {
			if (p.elements[i].type == OPERATOR && p.elements[i].operator == ".") {
				p.elements.splice(i, 1);
			} else {
				++i;
			}
		}
	}
}

function transformOperators(p) {
	if (p.type == CLUSTER || p.type == ROW) {
		let i = 0;
		while (i < p.elements.length) {
			if (p.elements[i].type == OPERATOR) {
				let element = p.elements[i];
				if (element.operator == ".") {
					element.operator = "&sdot;";
				} else if (element.operator == "^") {
					element.operator = "&and;";
				} else if (element.operator == "!" && i == 0) {
					element.operator = "&not;";
				}
			}
			++i;
		}
	}
}

function writeScripted(nesting) {
	if (this.base && this.subscript && this.superscript) {
		return pad("<msubsup>", nesting) +
			this.base.write(nesting + 1) +
			this.subscript.write(nesting + 1) +
			this.superscript.write(nesting + 1) +
			pad("</msubsup>", nesting);
	} else if (this.base && this.superscript) {
		return pad("<msup>", nesting) +
			this.base.write(nesting + 1) +
			this.superscript.write(nesting + 1) +
			pad("</msup>", nesting);
	} else if (this.base && this.subscript) {
		return pad("<msub>", nesting) +
			this.base.write(nesting + 1) +
			this.subscript.write(nesting + 1) +
			pad("</msub>", nesting);
	}
	return this.base.write(nesting);
}

function makeSubscript(base, subscript) {
	if (subscript.type == BRACKETED) {
		subscript = subscript.contents;
	}

	let scripted = {"type": SCRIPTED, "base": base, "subscript": subscript,
		"write": writeScripted,
		"children" : function(){return [this.base, this.subscript, this.superscript]} };
	return scripted;
}

function layoutSubscripts(p) {
	// The _ operator
	if ((p.type == CLUSTER) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && p.elements[i].type == OPERATOR &&
					p.elements[i].operator == "_")
			{
				let subscript = p.elements[i + 1];

				if (i > 0) {
					let base = p.elements[i - 1];
					p.elements.splice(i - 1, 3, makeSubscript(base, subscript));
				} else {
					// Create an dummy identifier
					let base = {"type": IDENTIFIER, identifier: "", "write": writeIdentifier};
					p.elements.splice(i, 2, makeSubscript(base, subscript));
				}
			} else {
				--i;
			}
		}
	}

	// Identifier + Number creates a subscript
	if ((p.type == CLUSTER) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && p.elements[i].type == IDENTIFIER &&
					p.elements[i + 1].type == NUMBER)
			{
				let base = p.elements[i];
				let subscript = p.elements[i + 1];

				p.elements.splice(i, 2, makeSubscript(base, subscript));
			} else {
				--i;
			}
		}
	}
}

function makeSuperscript(base, superscript) {
	if (superscript.type == BRACKETED) {
		superscript = superscript.contents;
	}

	if (base.type == SCRIPTED && !base.superscript) {
		base.superscript = superscript;
		return base;
	} else {
		let scripted = {"type": SCRIPTED, "base": base, "superscript": superscript,
			"write": writeScripted,
			"children" : function(){return [this.base, this.subscript, this.superscript]} };
		return scripted;
	}
}

function layoutExponents(p) {
	if ((p.type == CLUSTER) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && p.elements[i].type == OPERATOR &&
					p.elements[i].operator == "^")
			{
				let superscript = p.elements[i + 1];

				if (i > 0) {
					let base = p.elements[i - 1];
					p.elements.splice(i - 1, 3, makeSuperscript(base, superscript));
				} else {
					// Create a dummy identifier
					let base = {"type": IDENTIFIER, "identifier": "", "write": writeIdentifier};
					p.elements.splice(i, 2, makeSuperscript(base, superscript));
				}

			} else {
				--i;
			}
		}
	}
}

function isSuperscriptWhenFinal(c) {
	return c == "&lowast;" || c == "+" || c == "&minus;";
}

function makeOperatorsSuperscript(p) {
	if ((p.type == CLUSTER) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && p.elements[i + 1].type == OPERATOR) {
				let op = p.elements[i + 1].operator;
				if (isPrimeMark(op) ||
					(i + 2 == p.elements.length && isSuperscriptWhenFinal(op)))
				{
					let base = p.elements[i];
					let primemark = p.elements[i + 1];

					p.elements.splice(i, 2, makeSuperscript(base, primemark));
				}
			}
			--i;
		}
	}
}

function writeRoot(nesting) {
	let result;

	if (this.index) {
		result = pad("<mroot>", nesting) +
			this.radicand.write(nesting + 1) +
			this.index.write(nesting + 1) +
			pad("</mroot>", nesting);
	} else {
		result = pad("<msqrt>", nesting) +
			this.radicand.write(nesting + 1) +
			pad("</msqrt>", nesting);
	}
	return result;
}

function makeCluster(nodeArray) {
	if (nodeArray.length > 1) {
		return {"type": CLUSTER,
			"elements": nodeArray,
			"write": writeRow,
			"children": function(){return this.elements} };
	} else if (nodeArray.length == 1) {
		return nodeArray[0];
	}

	return "";
}

function isRadical(p) {
	if (p.type == CLUSTER && p.elements.length == 1) {
		return isRadical(p.elements[0]);
	}
	if (p.operator) {
		return p.operator == "sqrt" || p.operator == "root";
	}
	return false;
}

function getRadicalIndex(p) {
	if (p.type == CLUSTER && p.elements.length == 1) {
		return getRadicalIndex(p.elements[0]);
	}
	if (p.type == LIMITS) {
		return p.lower;
	}
	return "";
}

function layoutRoots(p) {
	if ((p.type == CLUSTER || p.type == ROW) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && isRadical(p.elements[i])) {
				let radicand = p.elements[i + 1];
				if (radicand.type == BRACKETED) {
					radicand = radicand.contents;
				}

				let index = getRadicalIndex(p.elements[i]);

				let radical = {"type": ROOT, "radicand": radicand, "index": index,
					"write": writeRoot, "children": function(){return [this.radicand, this.index]} };

				p.elements.splice(i, 2, radical);
			}
			--i;
		}
	}
}

function writeFraction(nesting) {
	return pad("<mfrac>", nesting) +
		this.numerator.write(nesting + 1) +
		this.denominator.write(nesting + 1) +
		pad("</mfrac>", nesting);
}

function layoutFractions(p) {
	if (p.type == CLUSTER && p.elements.length >= 3) {
		let i = 1;
		while (i + 1 < p.elements.length) {
			if (p.elements[i].type == OPERATOR && p.elements[i].operator == "/") {
				let frac = {"type": FRACTION, "numerator": null, denominator: null,
						"write": writeFraction,
						"children" : function(){return [this.numerator, this.denominator]} };

				frac.numerator = makeCluster(p.elements.slice(0, i));
				frac.denominator = makeCluster(p.elements.slice(i + 1));

				if (frac.numerator.type == BRACKETED) {
					frac.numerator = frac.numerator.contents;
				}
				if (frac.denominator.type == BRACKETED) {
					frac.denominator = frac.denominator.contents;
				}

				p.elements.splice(0, p.elements.length, frac);
				break;
			} else {
				++i;
			}
		}
	} else if (p.type == ROW && p.elements.length >= 3) {
		let i = 0;
		while (i + 2 < p.elements.length) {
			if (p.elements[i + 1].type == OPERATOR && p.elements[i + 1].operator == "/") {
				let frac = {"type": FRACTION, "numerator": null, denominator: null,
						"write": writeFraction,
						"children" : function(){return [this.numerator, this.denominator]} };
				frac.numerator = p.elements[i];
				frac.denominator = p.elements[i + 2];

				if (frac.numerator.type == BRACKETED) {
					frac.numerator = frac.numerator.contents;
				}
				if (frac.denominator.type == BRACKETED) {
					frac.denominator = frac.denominator.contents;
				}

				p.elements.splice(i, 3, frac);
			} else {
				++i;
			}
		}
	}
}

function writeLimits(nesting) {
	let result = "";
	if ((this.operator || this.nested) && this.lower) {
		if (this.upper) {
			result = pad("<munderover>", nesting);
			result += this.operator ? pad("<mo largeop=true>" + this.operator + "</mo>", nesting + 1) :
					this.nested ? this.nested.write(nesting + 1) : "";
			result += this.lower.write(nesting + 1);
			result += this.upper.write(nesting + 1);
			result += pad("</munderover>", nesting);
		} else {
			result = pad("<munder>", nesting);
			result += this.operator ? pad("<mo largeop=true>" + this.operator + "</mo>", nesting + 1) :
					this.nested ? this.nested.write(nesting + 1) : "";
			result += this.lower.write(nesting + 1);
			result += pad("</munder>", nesting);
		}
	}
	return result;
}

function layoutRanges(p) {
	if (p.type == CLUSTER && p.elements.length >= 2) {
		let i = 0;
		while (i + 1 < p.elements.length) {
			if (p.elements[i + 1].type == BRACKETED && p.elements[i + 1].left == '[' &&
					p.elements[i + 1].contents)
			{
				let range = p.elements[i + 1].contents;
				let lowerLimit = range;
				let upperLimit = null;

				if (range.elements) {
					for (let j = 0; j < range.elements.length; ++j) {
						if (range.elements[j].type == OPERATOR && range.elements[j].operator == "..") {
							lowerLimit = makeCluster(range.elements.slice(0, j));
							upperLimit = makeCluster(range.elements.slice(j + 1));
							break;
						}
					}
				}

				if (p.elements[i].type == OPERATOR) {
					let limit = {"type": LIMITS,
							"operator": p.elements[i].operator,
							"lower": lowerLimit, "upper": upperLimit,
							"write": writeLimits,
							"children": function(){return [this.lower, this.upper]} };
					p.elements.splice(i, 2, limit);
				} else if (p.elements[i].type == LIMITS) {
					// You can nest limits.
					let limit = {"type": LIMITS,
							"nested": p.elements[i],
							"lower": lowerLimit, "upper": upperLimit,
							"write": writeLimits,
							"children": function(){return [this.nested, this.lower, this.upper]} };
					p.elements.splice(i, 2, limit);
				} else if (p.elements[i].type == BRACKETED || p.elements[i].type == IDENTIFIER) {
					// Ranges on a bracketed group or identifier are written like super/subscripts.
					// This can be used as an alternative to subscript syntax for some things.
					let limit = {"type": SCRIPTED,
						"base": p.elements[i],
						"subscript": lowerLimit, "superscript": upperLimit,
						"write": writeScripted,
						"children": function(){return [this.base, this.subscript, this.superscript]} };
					p.elements.splice(i, 2, limit);
				} else {
					++i;
				}
			} else {
				++i;
			}
		}
	}
}

function writeOverbrace(nesting) {
	let result = "";
	result = pad("<mover>", nesting);
	result += pad("<mover>", nesting + 1);
	result += this.base.write(nesting + 2);
	result += pad("<mo>&OverBrace;</mo>", nesting + 2);
	result += pad("</mover>", nesting + 1);
	result += this.comment.write(nesting + 1);
	result += pad("</mover>", nesting);

	return result;
}

function writeUnderbrace(nesting) {
	let result = "";
	result = pad("<munder>", nesting);
	result += pad("<munder>", nesting + 1);
	result += this.base.write(nesting + 2);
	result += pad("<mo>&UnderBrace;</mo>", nesting + 2);
	result += pad("</munder>", nesting + 1);
	result += this.comment.write(nesting + 1);
	result += pad("</munder>", nesting);

	return result;
}

function makeRowFromCells(cells) {
	let rows = [];
	for (cell of cells) {
		rows.push(cell.row);
	}

	if (rows.length > 1) {
		return {"type": ROW,
			"elements": rows,
			"write": writeRow,
			"children": function(){return this.elements} };
	} else if (rows.length == 1) {
		return rows[0]
	}

	return "";
}

function layoutBraceComments(p) {
	if (p.type == CLUSTER && p.elements) {
		let i = 0;
		while (i + 1 < p.elements.length) {
			if (p.elements[i].type == OPERATOR &&
				(p.elements[i].operator == "overbrace" || p.elements[i].operator == "underbrace") &&
				p.elements[i + 1].type == BRACKETED &&
				p.elements[i + 1].contents && p.elements[i + 1].contents.type == GRID &&
				p.elements[i + 1].contents.gridrows && p.elements[i + 1].contents.gridrows.length == 2)
			{
				let grid = p.elements[i + 1].contents;

				let comment = makeRowFromCells(grid.gridrows[0].cells);
				let base = makeRowFromCells(grid.gridrows[1].cells);

				let over = (p.elements[i].operator == "overbrace");

				let braced = {"type": (over ? OVERBRACE : UNDERBRACE),
						"base": base, "comment": comment,
						"write": (over ? writeOverbrace : writeUnderbrace),
						"children": function(){return [this.base, this.comment]} };

				p.elements.splice(i, 2, braced);
			}
			++i;
		}
	}
}

const START = "<--";
const END = "-->";

function parseArrowLine(s, targetLine, bracetype) {
	let annotations = [];

	let i = 0;
	while (i < s.length) {
		let start = 0;
		let end = 0;
		let comment = "";

		if (s.substring(i, i + START.length) == START) {
			start = i;
			i += START.length;
			while (i < s.length) {
				if (s.substring(i, i + END.length) == END) {
					i += END.length;
					let annotation = {
						"bracetype": bracetype, "targetLine": targetLine,
						"start": start, "end": i,
						"comment": comment
					};
					annotations.push(annotation);
					break;
				} else {
					comment += s[i];
					++i;
				}
			}
		} else {
			++i;
		}
	}

	return annotations;
}

function annotateLine(s, annotation) {
	return s.substring(0, annotation.start) +
		annotation.bracetype + "(" +
		annotation.comment + ";" +
		s.substring(annotation.start, annotation.end) + ")" +
		s.substring(annotation.end);
}

function handleBraceArrows(lines) {
	let annotationArray = [];

	for (let i = 0; i < lines.length; ++i) {
		let line = lines[i];
		if (line.match(/^\s*<--.*-->\s*$/)) {
			let bracetype;
			let targetLine;
			if (i == 0 || lines[i - 1].match(/^\s*$/)) {
				bracetype = "overbrace";
				targetLine = i + 1;
			} else {
				bracetype = "underbrace";
				targetLine = i - 1;
			}

			let annotations = parseArrowLine(line, targetLine, bracetype);
			annotationArray.push(...annotations);

			lines[i] = "";
		}
	}

	annotationArray.sort((a, b) => (b.end - b.start) - (a.end - a.start));  // Longest first.

	for (let i = 0; i < annotationArray.length; ++i) {
		let annotation = annotationArray[i];
		let targetLine = annotation.targetLine;
		lines[targetLine] = annotateLine(lines[targetLine], annotation);

		startAdjustment = annotation.bracetype.length + annotation.comment.length + 2;  // 2 = "(".length + ";".length
		endAdjustment = startAdjustment + 1;  // 1 == ")".length

		// Adjust the positions of the subsequent annotations.
		for (let j = i + 1; j < annotationArray.length; ++j ) {
			if (annotationArray[j].start >= annotation.end) {
				annotationArray[j].start += endAdjustment;
			} else if (annotationArray[j].start >= annotation.start) {
				annotationArray[j].start += startAdjustment;
			}
			if (annotationArray[j].end >= annotation.end) {
				annotationArray[j].end += endAdjustment;
			} else if (annotationArray[j].end >= annotation.start) {
				annotationArray[j].end += startAdjustment;
			}
		}
	}
}

function MightyMathMarkdown() {
	let nodeIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
	let node;

	node = nodeIterator.nextNode();
	while (node) {
		let splits = node.textContent.split("###");
		if (splits.length <= 1) {
			node = nodeIterator.nextNode();
			continue;
		}

		let newNodes = [];

		for (let i = 0; i < splits.length; i += 2) {
			newNodes.push(document.createTextNode(splits[i]));
			if (i + 1 < splits.length) {
				let source = splits[i + 1];
				for (let block of source.split("\n\n")) {
					if (!block) {
						continue;
					}
					let div = document.createElement("div");
					div.innerHTML = toMathML(block, DISPLAY_STYLE);
					newNodes.push(div);
				}
			}
		}

		let oldNode = node;
		node = nodeIterator.nextNode();
		for (newNode of newNodes) {
			oldNode.parentNode.insertBefore(newNode, oldNode);
		}
		oldNode.textContent = "";
	}

	nodeIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);

	// TODO: Inline style
}

document.addEventListener("DOMContentLoaded", MightyMathMarkdown);
