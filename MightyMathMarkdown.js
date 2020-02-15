const debugMode = true;

const INLINE_STYLE = 0;
const DISPLAY_STYLE = 1;

function toMathML(s, isDisplayStyle) {
	s = s.replace(/\n/g, " ").replace(/\t/g, "  ");
	console.log(s);

	let tree = parse(s);	
	// createSubscripts(tree);
	// createSuperscripts(tree);
	// createSqrt(tree);
	// createRoot(tree);
	// createRangeOps(tree);
	// createFrac(tree);
	// TODO: Remove round brackets inside vertical bar brackets.
	let result = write(tree, isDisplayStyle);

	console.log(result);
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
const NUMBER= 9;
// TODO: VINCULUM
// TODO: SQRT
// TODO: ROOT
// TODO: FRAC
// TODO: SCRIPTED
// TODO: OVERBRACE
// TODO: UNDERBRACE

function parse(s) {
	let parseObject = {};
	parseObject.s = s;
	parseObject.i = 0;
	parseObject.expectTerm = true;
	parseObject.expectBracket = "";

	return parseGrid(parseObject);
}

function matchString(p, s)
{
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
 
function writeGrid(nesting)
{
	let result = "";

	result += pad("<mtable>", nesting);
	for (let gridrow of this.gridrows) {
		result += gridrow.write(nesting + 1);
	}
	result += pad("</mtable>", nesting);

	return result;
}

function parseGrid(p) {
	let result = {"type": GRID, "gridrows": [], "write": writeGrid};

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

function writeGridRow(nesting)
{
	let result = "";

	result += pad("<mtr>", nesting);
	for (let cell of this.cells) {
		result += cell.write(nesting + 1);
	}
	result += pad("</mtr>", nesting);

	return result;
}

function parseGridRow(p) {
	let result = {"type": GRIDROW, "cells": [], "write": writeGridRow};

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

function writeCell(nesting)
{
	let result = "";

	result += pad("<mtd>", nesting);
	result += this.row.write(nesting + 1);
	result += pad("</mtd>", nesting);

	return result;
}

function parseCell(p) {
	let result = {"type": CELL, "row": parseRow(p), "write": writeCell};

	if (!result.row) {
		return "";
	}

	return result;
}

function writeRow(nesting)
{
	let result = "";

	result += pad("<mrow>", nesting);
	for (let element of this.elements) {
		result += element.write(nesting + 1);
	}
	result += pad("</mrow>", nesting);

	return result;
}

function parseRow(p) {
	let result = {"type": ROW, "elements": [], "write": writeRow};

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
	let result = {"type": CLUSTER, "elements": [], "write": writeRow};

	while (p.i < p.s.length) {
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
	let result = {"type": BRACKETED, "left": "", "right": "", "contents": null, "write" : writeBracketed};

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

function writeText(nesting)
{
	return pad("<mtext>&nbsp;&nbsp;" + this.text + "&nbsp;&nbsp;</mtext>", nesting);
}

function parseText(p) {
	// Text appears in double-quotes. Like "this".

	// TODO: Allow escaped double-quote charactes in the text

	if (matchString(p, "\"")) {
		let result = {"type": TEXT, "text": "", "write" : writeText};

		while (!matchString(p, "\"")) {
			result.text += p.s[p.i];
			++p.i;
		}

		return result;
	}

	return "";
}

const alphaIdentifiers = {
	// Ambiguous with operators
	"x" : "x",
	"X" : "X",
	"o" : "o",
	"v" : "v",
	"V" : "V",

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
};

const nonAlphaIdentifiers = {
	"\\u" : "&micro;",
	"µ" : "&micro;",   // Some European keyboards have this as a key

	"\\theta" : "&thetasym;",
	"\\pi" : "&piv;",
	"\\sigma" : "&sigmaf;",
	"\\upsilon" : "&upsih;",

	"\\p" : "&weierp;",

	// Non HTML 4.0
	"\\phi": "&phiv;",
};

const maxNonAlphaIdentifierKeyLength = 8;

const alphaOperators = {
	// These operators are ASCII text strings. Are there any other ASCII words
	// that should be treated as operators?
	// TODO: Treat ASCII strings at operators if enclosed in a pair of colons. :operator:
	"lim" : "lim",
	"det" : "det",

	// HTML 4.0 entities
	"x" : "&times;",
	"X" : "&times;",

	"sqrt": "&radic;",
	"root": "&radic;",

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

	"v" : "&or;",
	"V" : "&or;",

	"cup" : "&cup;",
	"cap" : "&cap;",
	
	"ang" : "&ang;",
	"angle" : "&ang;",

	"therefore" : "&there4;",

	// Non HTML 4.0
	"o" : "&compfn;"
};

function isPostfix(op) {
	return op == "%" || op == "&prime;" || op == "&hellip;";
}

const nonAlphaOperators = {
	// Operators which need special handling
	"_" : "_",      // Suscripting
	"^" : "^",      // Superscripting. Can also represent &and;
	"/" : "/",      // Fractions
	"." : "&sdot;", // Invisible multiplication. Can also represent &sdot;
	"!" : "!",      // Factorial. Can also represent &not;
	"*" : "&times;",// Multiplication. Can also represent &lowast;
	":" : "&af;",   // An invisible operator. Can also represent spaced colon.
	".." : "..",    // Special syntax for ranges.
	
	// These letter-like operators have special formatting
	"\\P" : "P",
	"\\C" : "C",
	"\\F" : "F",  // Hyper-geometric function

	// HTML 4.0 operators
	"\'" : "&prime;",
	"%" : "%",

	"..." : "&hellip;",

	"\\A:" : "&forall;",
	"\\E:" : "&exist;",

	"\\:" : ":",   // Allow an escaped literal colon
	"\\;" : ";",   // Allow an escaped literal semicolon

	"-" : "&minus;",
	"+/-" : "&plusmn;",

	"@" : "&part;",

	"\\v" : "&or;",

	"$" : "&int;",

	"=" : "=",
	"!=" : "=",
	"¬=" : "=",

	"==" : "=",
	"!==" : "&ne;",
	"¬==" : "&ne;",

	"===" : "&equiv;",
	
	"~" : "&sim;",
	"~~" : "&asymp;",
	"~==" : "&cong;",

	"<" : "&lt;",
	">" : "&gt;",
	"<=" : "&le;",
	">=" : "&ge;",
	
	":<:" : "&sub;",  // Subset // TODO: Not a subset
	":>:" : "&sup;",  // Superset
	":<=:" : "&sube;",
	":>=:" : "&supe;",

	":!<:" : "&nsub;",
	":¬<:" : "&nsub;",

	"_|_" : "&perp;",

	"(*)" : "&otimes;",
	"(+)" : "&oplus;",

	"->" : "&rarr;",  // This one has a shortform
	"-->" : "&rarr;",
	"<--" : "&larr;",
	"<->" : "&harr;",

	"==>" : "&rArr;",
	"<==" : "&lArr;",
	"<=>" : "&hArr;",

	"\\d" : "d",   // An upright 'd' for differentials.
	               // MathML defines a codepoint for this (&DifferentialD;), which is
                       // a good idea for semantic interpretation, but MathML specifies it
                       // should be rendered as a double-struck 'd'. I don't know anyone who
	               // wants it to look that way.

	// Not in HTML 4.0
	"||" : "&par;",
	"|" : "&mid;",

	"~=" : "&sime;",
	"<<" : "&ll;",
	">>" : "&rr;",
	"<<<" : "&Ll;",
	">>>" : "&Rr;",

	"$$" : "&Int;",
	"$$$" : "&iiint;",
};

const maxNonAlphaOperatorKeyLength = 4;

function writeIdentifier(nesting) {
	let isCapitalLetter = (this.identifier.length == 1 && this.identifier >= "A" && this.identifier <= "Z");
	let startTag = isCapitalLetter ? "<mi mathvariant=normal>" : "<mi>";
	return pad(startTag + this.identifier + "</mi>", nesting);
}

function parseIdentifier(p) {
	return parseQuotedIdentifier(p) || parseAlphaIdentifier(p) || parseNonAlphaIdentifier(p);
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

		while(!matchString(p, "\'")) {
			result.identifier += p.s[p.i];
			++p.i;
		}

		return result;
	}

	return "";
}

function parseAlphaIdentifier(p) {
	let result = {"type": IDENTIFIER, "identifier": "", "write" : writeIdentifier};

	if (p.i < p.s.length && isAlpha(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		let s = p.s.substring(p.i, end);

		if (s in alphaIdentifiers) {
			result.identifier = alphaIdentifiers[s];
			p.i = end;
			return result;
		}
	}

	return "";
}

function parseNonAlphaIdentifier(p) {
	let result = {"type": IDENTIFIER, "identifier": "", "write" : writeIdentifier};
	
	for (let i = maxNonAlphaIdentifierKeyLength; i > 0; --i) {
		if (p.i + i <= p.s.length) {
			let s = p.s.substring(p.i, p.i + i)
			if (s in nonAlphaIdentifiers) {
				result.identifier = nonAlphaIdentifiers[s];
				p.i += i;
				return result;
			}
		}
	}

	return "";
}

function writeOperator(nesting) {
	return pad("<mo>" + this.operator + "</mo>", nesting);
}

function parseOperator(p) {
	return parseAlphaOperator(p) || parseNonAlphaOperator(p);
}

function parseAlphaOperator(p) {
	let result = {"type": OPERATOR, "operator": "", "write": writeOperator};

	if (p.i < p.s.length && isAlpha(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		let s = p.s.substring(p.i, end);

		if (s in alphaOperators) {
			result.operator = alphaOperators[s];
			p.i = end;
			return result;
		}
	}

	return "";
}

function parseNonAlphaOperator(p) {
	let result = {"type": OPERATOR, "operator": "", "write": writeOperator};

	if (p.expectBracket && matchString(p, p.expectBracket)) {
		// We don't want to match the final bracket
		p.i -= p.expectBracket.length;  // Rewind
		return "";
	}

	for (let i = maxNonAlphaOperatorKeyLength; i > 0; --i) {
		if (p.i + i <= p.s.length) {
			let s = p.s.substring(p.i, p.i + i)
			if (s in nonAlphaOperators) {
				p.i += i;
				result.operator = nonAlphaOperators[s];
				break;
			}
		}
	}

	if (result.operator) {
		return result;
	}

	return "";
}

function parseUnrecognized(p) {
	if (p.expectBracket && matchString(p, p.expectBracket)) {
		// We don't want to match the final bracket
		p.i -= p.expectBracket.length;  // Rewind
		return "";
	}

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
